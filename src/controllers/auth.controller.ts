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

async function ensureSystemSections(userId: string) {
  const existing = await prisma.section.findMany({
    where: {
      userId,
      isSystem: true,
    },
  });

  const existingSlugs = new Set(existing.map((s) => s.slug));

  const toCreate = SYSTEM_SECTIONS.filter((s) => !existingSlugs.has(s.slug));

  if (toCreate.length === 0) return;

  await prisma.section.createMany({
    data: toCreate.map((s) => ({
      userId,
      name: s.name,
      slug: s.slug,
      isSystem: true,
      order: s.order,
    })),
  });
}

export const login = async (context: Context) => {
  const { username, password } = await context.req.json();

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return context.json({ message: "Invalid credentials" }, 401);
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return context.json({ message: "Invalid credentials" }, 401);
  }

  await ensureSystemSections(user.id);

  const token = sign({ id: user.id, username: user.username });
  return context.json({
    token,
    user: { id: user.id, username: user.username, name: user.name },
  });
};
