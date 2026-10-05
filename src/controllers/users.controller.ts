import type { Context } from "hono";
import bcrypt from "bcryptjs";
import prisma from "../prisma/index.js";
import { SYSTEM_SECTIONS } from "./auth.controller.js";
import {
  createSession,
  revokeAllSessions,
  sessionMetadataFrom,
} from "../services/auth.service.js";

async function ensureSystemSections(pairId: string) {
  const existing = await prisma.section.findMany({
    where: { pairId, isSystem: true },
  });
  const existingSlugs = new Set(existing.map((s) => s.slug));
  const toCreate = SYSTEM_SECTIONS.filter((s) => !existingSlugs.has(s.slug));
  if (toCreate.length === 0) return;
  await prisma.section.createMany({
    data: toCreate.map((s) => ({
      pairId,
      name: s.name,
      slug: s.slug,
      isSystem: true,
      order: s.order,
    })),
  });
}

export const linkPartner = async (context: Context) => {
  const user = context.get("user");
  const { partnerUsername } = await context.req.json();

  if (!partnerUsername || typeof partnerUsername !== "string") {
    return context.json({ message: "partnerUsername is required" }, 400);
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, pairId: true },
  });
  if (!currentUser) {
    return context.json({ message: "User not found" }, 404);
  }
  if (currentUser.pairId) {
    return context.json({ message: "Вы уже привязаны к партнёру" }, 400);
  }

  const partner = await prisma.user.findUnique({
    where: { username: partnerUsername },
    include: {
      pair: true,
    },
  });
  if (!partner) return context.json({ message: "User not found" }, 404);
  if (partner.id === currentUser.id) {
    return context.json({ message: "Нельзя привязаться к самому себе" }, 400);
  }
  if (partner.pair) {
    return context.json({ message: "Partner already linked" }, 400);
  }

  const pair = await prisma.$transaction(async (tx) => {
    const created = await tx.pair.create({
      data: {
        userAId: currentUser.id,
        userBId: partner.id,
      },
    });
    await tx.user.update({
      where: { id: currentUser.id },
      data: { pairId: created.id },
    });
    await tx.user.update({
      where: { id: partner.id },
      data: { pairId: created.id },
    });
    return created;
  });

  await ensureSystemSections(pair.id);

  return context.json({ message: "Linked successfully" });
};

export const getMe = async (context: Context) => {
  const user = context.get("user");
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      pairId: true,
      pair: {
        select: {
          id: true,
          userA: { select: { id: true, username: true, name: true } },
          userB: { select: { id: true, username: true, name: true } },
        },
      },
    },
  });
  if (!currentUser) return context.json({ message: "User not found" }, 400);
  return context.json(currentUser);
};

const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const updateMe = async (context: Context) => {
  const user = context.get("user");
  const body = await context.req.json().catch(() => ({}));
  const { name, username, email } = body ?? {};
  if (name === undefined && username === undefined && email === undefined) {
    return context.json({ message: "Нечего обновлять" }, 400);
  }

  const updateData: { name?: string; username?: string; email?: string } = {};

  if (name !== undefined) {
    if (typeof name !== "string") {
      return context.json({ message: "Неверный формат имени" }, 400);
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 64) {
      return context.json(
        { message: "Имя должно содержать от 1 до 64 символов" },
        400,
      );
    }
    updateData.name = trimmedName;
  }

  if (username !== undefined) {
    if (typeof username !== "string") {
      return context.json({ message: "Неверный формат username" }, 400);
    }
    const trimmedUsername = username.trim();
    if (
      trimmedUsername.length < 3 ||
      trimmedUsername.length > 32 ||
      !USERNAME_REGEX.test(trimmedUsername)
    ) {
      return context.json(
        {
          message:
            "Username должен содержать от 3 до 32 символов: латиница, цифры, _ . -",
        },
        400,
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username: trimmedUsername },
      select: { id: true },
    });
    if (existing && existing.id !== user.id) {
      return context.json(
        { message: "Такое имя пользователя уже занято" },
        409,
      );
    }

    updateData.username = trimmedUsername;
  }

  if (email !== undefined) {
    if (typeof email !== "string") {
      return context.json({ message: "Неверный формат email" }, 400);
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return context.json({ message: "Некорректный email" }, 400);
    }
    const existingEmail = await prisma.user.findUnique({
      where: { email: trimmedEmail },
      select: { id: true },
    });
    if (existingEmail && existingEmail.id !== user.id) {
      return context.json({ message: "Этот email уже используется" }, 409);
    }
    updateData.email = trimmedEmail;
  }

  const { password: _, ...me } = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  return getMe(context);
};

export const changePassword = async (context: Context) => {
  const user = context.get("user");
  const body = await context.req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body ?? {};

  if (
    !currentPassword ||
    typeof currentPassword !== "string" ||
    currentPassword.length === 0
  ) {
    return context.json({ message: "Введите текущий пароль" }, 400);
  }
  if (
    !newPassword ||
    typeof newPassword !== "string" ||
    newPassword.length < 6 ||
    newPassword.length > 128
  ) {
    return context.json(
      { message: "Новый пароль должен содержать от 6 до 128 символов" },
      400,
    );
  }
  if (currentPassword === newPassword) {
    return context.json(
      { message: "Новый пароль должен отличаться от текущего" },
      400,
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      password: true,
    },
  });
  if (!dbUser) {
    return context.json({ message: "Пользователь не найден" }, 404);
  }

  const isValid = await bcrypt.compare(currentPassword, dbUser.password);
  if (!isValid) {
    return context.json({ message: "Неверный текущий пароль" }, 400);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash },
  });

  // Смена пароля — повод считать все выданные токены скомпрометированными.
  // Текущее устройство получает новую пару, остальные сессии отзываются.
  await revokeAllSessions(user.id, "password_change");
  const auth = await createSession(
    {
      id: dbUser.id,
      username: dbUser.username,
      name: dbUser.name,
      email: dbUser.email,
    },
    sessionMetadataFrom(context, (body ?? {}) as Record<string, unknown>),
  );

  return context.json({ success: true, ...auth });
};

/**
 * Полное удаление аккаунта по запросу пользователя (требование сторов).
 *
 * Требуется пароль: это необратимое действие, и мы хотим быть уверены,
 * что его инициирует владелец, а не кто-то с разблокированным телефоном.
 *
 * Что делаем в одной транзакции:
 *  - отвязываем обоих (у партнёра обнуляется pairId, его аккаунт жив);
 *  - удаляем пару и все её общие секции/записи/таблицы;
 *  - удаляем собственные записи, устройства и сессии пользователя;
 *  - удаляем самого пользователя (каскадом уходят сессии, refresh-токены,
 *    reset-токены, избранное).
 */
export const deleteMe = async (context: Context) => {
  const user = context.get("user");
  const body = await context.req.json().catch(() => ({}));
  const { password } = (body ?? {}) as { password?: unknown };

  if (!password || typeof password !== "string" || password.length === 0) {
    return context.json({ message: "Введите пароль для подтверждения" }, 400);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, password: true, pairId: true },
  });
  if (!dbUser) {
    return context.json({ message: "Пользователь не найден" }, 404);
  }

  const isValid = await bcrypt.compare(password, dbUser.password);
  if (!isValid) {
    return context.json({ message: "Неверный пароль" }, 400);
  }

  await prisma.$transaction(async (tx) => {
    if (dbUser.pairId) {
      const pair = await tx.pair.findUnique({ where: { id: dbUser.pairId } });
      if (pair) {
        const partnerId =
          pair.userAId === user.id ? pair.userBId : pair.userAId;

        // Отвязываем обоих — у партнёра аккаунт остаётся, но без пары.
        await tx.user.updateMany({
          where: { id: { in: [user.id, partnerId] } },
          data: { pairId: null },
        });

        // Общие секции и их записи.
        const sections = await tx.section.findMany({
          where: { pairId: pair.id },
          select: { id: true },
        });
        const sectionIds = sections.map((s) => s.id);
        if (sectionIds.length > 0) {
          await tx.record.deleteMany({
            where: { sectionId: { in: sectionIds } },
          });
          await tx.section.deleteMany({ where: { id: { in: sectionIds } } });
        }

        // Общие таблицы и всё содержимое.
        const tableSections = await tx.tableSection.findMany({
          where: { pairId: pair.id },
          select: { id: true },
        });
        const tsIds = tableSections.map((s) => s.id);
        if (tsIds.length > 0) {
          const tables = await tx.table.findMany({
            where: { sectionId: { in: tsIds } },
            select: { id: true },
          });
          const tableIds = tables.map((t) => t.id);
          if (tableIds.length > 0) {
            await tx.cell.deleteMany({
              where: {
                OR: [
                  { row: { tableId: { in: tableIds } } },
                  { field: { tableId: { in: tableIds } } },
                ],
              },
            });
            await tx.row.deleteMany({
              where: { tableId: { in: tableIds } },
            });
            await tx.field.deleteMany({
              where: { tableId: { in: tableIds } },
            });
            await tx.table.deleteMany({ where: { id: { in: tableIds } } });
          }
          await tx.tableSection.deleteMany({ where: { id: { in: tsIds } } });
        }

        await tx.pair.delete({ where: { id: pair.id } });
      }
    }

    await tx.userFavoritesRecord.deleteMany({ where: { userId: user.id } });
    await tx.record.deleteMany({ where: { userId: user.id } });
    await tx.device.deleteMany({ where: { userId: user.id } });

    await tx.user.delete({ where: { id: user.id } });
  });

  return context.json({ message: "Аккаунт удалён" });
};
