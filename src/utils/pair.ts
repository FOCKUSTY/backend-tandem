import { SYSTEM_SECTIONS } from "../controllers/auth.controller.js";
import prisma from "../prisma/index.js";

export async function getPairId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pairId: true },
  });
  return user?.pairId || null;
}

export async function ensurePairSystemSections(pairId: string) {
  const existing = await prisma.section.findMany({
    where: { pairId, isSystem: true },
    select: { slug: true },
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
