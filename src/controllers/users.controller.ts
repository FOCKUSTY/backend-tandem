import type { Context } from "hono";
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

  const partner = await prisma.user.findUnique({
    where: { username: partnerUsername },
    include: {
      pair: true,
    },
  });
  if (!partner) return context.json({ message: "User not found" }, 404);
  if (partner.pair) {
    return context.json({ message: "Partner already linked" }, 400);
  }

  const pair = await prisma.pair.create({
    data: {
      userAId: user.id,
      userBId: partner.id,
    },
  });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { pairId: pair.id },
    }),
    prisma.user.update({
      where: { id: partner.id },
      data: { pairId: pair.id },
    }),
  ]);

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
