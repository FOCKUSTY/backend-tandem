import { Context } from "hono";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sign } from "../jwt.js";
import prisma from "../prisma/index.js";
import { sendPasswordResetEmail } from "../utils/mailer.js";

export const SYSTEM_SECTIONS = [
  { name: "Правила", slug: "rules", order: 1 },
  { name: "Даты", slug: "dates", order: 2 },
  { name: "Планы", slug: "plans", order: 3 },
  { name: "Связь", slug: "contacts", order: 4 },
];

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

const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const register = async (context: Context) => {
  const body = await context.req.json().catch(() => ({}));
  const { username, password, name, email } = body ?? {};

  if (!username || typeof username !== "string") {
    return context.json({ message: "Укажите имя пользователя" }, 400);
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

  if (!name || typeof name !== "string") {
    return context.json({ message: "Укажите ваше имя" }, 400);
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 64) {
    return context.json(
      { message: "Имя должно содержать от 1 до 64 символов" },
      400,
    );
  }

  if (!email || typeof email !== "string") {
    return context.json({ message: "Укажите email" }, 400);
  }
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return context.json({ message: "Некорректный email" }, 400);
  }

  if (!password || typeof password !== "string") {
    return context.json({ message: "Укажите пароль" }, 400);
  }
  if (password.length < 6 || password.length > 128) {
    return context.json(
      { message: "Пароль должен содержать от 6 до 128 символов" },
      400,
    );
  }

  const existing = await prisma.user.findUnique({
    where: { username: trimmedUsername },
    select: { id: true },
  });
  if (existing) {
    return context.json({ message: "Такое имя пользователя уже занято" }, 409);
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: trimmedEmail },
    select: { id: true },
  });
  if (existingEmail) {
    return context.json({ message: "Этот email уже используется" }, 409);
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username: trimmedUsername,
      name: trimmedName,
      password: hash,
      email: trimmedEmail,
    },
    select: { id: true, username: true, name: true, email: true },
  });

  const token = sign({ id: user.id, username: user.username });
  return context.json({ token, user }, 201);
};

export const login = async (context: Context) => {
  const { username, password } = await context.req.json();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return context.json({ message: "Invalid credentials" }, 401);
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return context.json({ message: "Invalid credentials" }, 401);

  if (user.pairId) {
    await ensureSystemSections(user.pairId);
  }

  const token = sign({ id: user.id, username: user.username });
  return context.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
    },
  });
};

export const forgotPassword = async (context: Context) => {
  const { email } = await context.req.json();
  if (!email || typeof email !== "string") {
    return context.json({ message: "Укажите email" }, 400);
  }
  const trimmedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: trimmedEmail },
  });
  if (!user) {
    return context.json({
      message: "Если такой email зарегистрирован, письмо отправлено",
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3600000);

  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail(trimmedEmail, resetLink);
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return context.json({ message: "Ошибка отправки письма" }, 500);
  }

  return context.json({
    message: "Если такой email зарегистрирован, письмо отправлено",
  });
};

export const resetPassword = async (context: Context) => {
  const { token, newPassword } = await context.req.json();
  if (!token || typeof token !== "string") {
    return context.json({ message: "Неверный токен" }, 400);
  }
  if (
    !newPassword ||
    typeof newPassword !== "string" ||
    newPassword.length < 6 ||
    newPassword.length > 128
  ) {
    return context.json(
      { message: "Пароль должен содержать от 6 до 128 символов" },
      400,
    );
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
    return context.json({ message: "Неверный или просроченный токен" }, 400);
  }

  const hash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    }),
  ]);

  return context.json({ message: "Пароль успешно сброшен" });
};
