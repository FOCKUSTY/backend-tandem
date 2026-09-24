import { Context } from "hono";
import bcrypt from "bcryptjs";
import { sign } from "../jwt.js";
import prisma from "../prisma/index.js";

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

export const register = async (context: Context) => {
  const body = await context.req.json().catch(() => ({}));
  const { username, password, name } = body ?? {};

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

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username: trimmedUsername,
      name: trimmedName,
      password: hash,
    },
    select: { id: true, username: true, name: true },
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
    user: { id: user.id, username: user.username, name: user.name },
  });
};
