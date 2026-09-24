import type { Context } from "hono";
import bcrypt from "bcryptjs";
import prisma from "../prisma/index.js";
import { SYSTEM_SECTIONS } from "./auth.controller.js";

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

export const updateMe = async (context: Context) => {
  const user = context.get("user");
  const body = await context.req.json().catch(() => ({}));
  const { name, username } = body ?? {};

  if (name === undefined && username === undefined) {
    return context.json({ message: "Нечего обновлять" }, 400);
  }

  const updateData: { name?: string; username?: string } = {};

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
    select: { password: true },
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

  return context.json({ success: true });
};
