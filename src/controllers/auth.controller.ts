import { Context } from "hono";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../prisma/index.js";
import { sendPasswordResetEmail } from "../utils/mailer.js";
import { verifyAccessToken } from "../jwt.js";
import {
  createSession,
  listSessions,
  normalizeRememberChoice,
  revokeAllSessions,
  revokeOwnedSession,
  revokeSessionByRefreshToken,
  rotateRefreshToken,
  sessionMetadataFrom,
} from "../services/auth.service.js";

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

/**
 * `remember` — насколько "запомнить устройство": 30 | 60 | 90 | 120 дней
 * либо `"forever"` для бессрочной сессии. По умолчанию 90 дней.
 */
const readRemember = (body: Record<string, unknown>) =>
  normalizeRememberChoice(
    body.remember ?? body.rememberDays ?? body.rememberMe,
  );

const readBody = async (context: Context) => {
  const body = await context.req.json().catch(() => ({}));
  return (body ?? {}) as Record<string, unknown>;
};

const readString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

export const register = async (context: Context) => {
  const body = await readBody(context);
  const username = readString(body.username);
  const password = readString(body.password);
  const name = readString(body.name);
  const email = readString(body.email);

  if (!username) {
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

  if (!name) {
    return context.json({ message: "Укажите ваше имя" }, 400);
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 64) {
    return context.json(
      { message: "Имя должно содержать от 1 до 64 символов" },
      400,
    );
  }

  if (!email) {
    return context.json({ message: "Укажите email" }, 400);
  }
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return context.json({ message: "Некорректный email" }, 400);
  }

  if (!password) {
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

  const auth = await createSession(
    user,
    sessionMetadataFrom(context, body),
    readRemember(body),
  );
  return context.json(auth, 201);
};

export const login = async (context: Context) => {
  const body = await readBody(context);
  const username = readString(body.username)?.trim();
  const password = readString(body.password);
  if (!username || !password) {
    return context.json({ message: "Укажите логин и пароль" }, 400);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return context.json({ message: "Invalid credentials" }, 401);
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return context.json({ message: "Invalid credentials" }, 401);

  if (user.pairId) {
    await ensureSystemSections(user.pairId);
  }

  const auth = await createSession(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
    },
    sessionMetadataFrom(context, body),
    readRemember(body),
  );

  return context.json(auth);
};

/**
 * Обмен refresh-токена на новую пару. Ротация: старый токен становится
 * недействительным, повторная попытка его использовать отзывает всю сессию.
 */
export const refresh = async (context: Context) => {
  const body = await readBody(context);
  const refreshToken = readString(body.refreshToken);
  if (!refreshToken) {
    return context.json({ message: "Укажите refreshToken" }, 400);
  }

  const result = await rotateRefreshToken(
    refreshToken,
    sessionMetadataFrom(context, body),
  );

  if (result.status === "invalid") {
    return context.json(
      {
        message: "Недействительный refresh-токен",
        code: "INVALID_REFRESH_TOKEN",
      },
      401,
    );
  }

  if (result.status === "reuse") {
    return context.json(
      {
        message:
          "Refresh-токен уже был использован. Все сессии отозваны, войдите заново.",
        code: "REFRESH_TOKEN_REUSED",
      },
      401,
    );
  }

  return context.json(result.auth);
};

/** Отзывает текущую сессию по её refresh-токену. */
export const logout = async (context: Context) => {
  const body = await readBody(context);
  const refreshToken = readString(body.refreshToken);
  if (!refreshToken) {
    return context.json({ message: "Укажите refreshToken" }, 400);
  }

  await revokeSessionByRefreshToken(refreshToken, "logout");
  return context.json({ message: "Вы вышли из аккаунта" });
};

/** Отзывает все сессии пользователя (нужен access-токен). */
export const logoutAll = async (context: Context) => {
  const user = context.get("user");
  await revokeAllSessions(user.id, "logout_all");
  return context.json({ message: "Все сессии отозваны" });
};

export const sessions = async (context: Context) => {
  const user = context.get("user");
  const list = await listSessions(user.id);
  return context.json({ sessions: list });
};

export const revokeSession = async (context: Context) => {
  const user = context.get("user");
  const sessionId = context.req.param("id");
  if (!sessionId) {
    return context.json({ message: "Укажите id сессии" }, 400);
  }

  const revoked = await revokeOwnedSession(
    sessionId,
    user.id,
    "revoked_by_user",
  );
  if (!revoked) {
    return context.json({ message: "Сессия не найдена" }, 404);
  }

  return context.json({ message: "Сессия отозвана" });
};

/**
 * Сообщает, жив ли access-токен, — по телу запроса или по заголовку
 * Authorization.
 */
export const introspect = async (context: Context) => {
  const body = await readBody(context);
  const header = context.req.header("Authorization");
  const token =
    readString(body.accessToken) ??
    (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) {
    return context.json({ active: false });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return context.json({ active: false });
  }

  return context.json({
    active: true,
    user: { id: decoded.id, username: decoded.username },
  });
};

export const forgotPassword = async (context: Context) => {
  const body = await readBody(context);
  const email = readString(body.email);
  if (!email) {
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
  const body = await readBody(context);
  const token = readString(body.token);
  const newPassword = readString(body.newPassword);
  if (!token) {
    return context.json({ message: "Неверный токен" }, 400);
  }
  if (!newPassword || newPassword.length < 6 || newPassword.length > 128) {
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

  // Пароль сменился — все выданные ранее токены больше не должны работать.
  await revokeAllSessions(resetToken.userId, "password_reset");

  return context.json({ message: "Пароль успешно сброшен" });
};
