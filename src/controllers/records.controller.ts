import { Context } from "hono";
import prisma from "../prisma/index.js";

async function getPairId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pairId: true },
  });
  return user?.pairId ?? null;
}

async function getUserIdsInPair(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pair: {
        select: {
          userAId: true,
          userBId: true,
        },
      },
    },
  });
  if (!user?.pair) return [userId];
  return [user.pair.userAId, user.pair.userBId];
}

export const getRecordById = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id")!;
  const userIds = await getUserIdsInPair(user.id);

  const record = await prisma.record.findUnique({
    where: { id },
    include: { section: { select: { id: true, name: true, slug: true } } },
  });
  if (!record) return context.json({ message: "Запись не найдена" }, 404);
  if (!userIds.includes(record.userId)) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }
  return context.json(record);
};

export const getRecords = async (context: Context) => {
  const user = context.get("user");
  const {
    sectionIds,
    tags,
    isCompleted,
    isPinned,
    dateFrom,
    dateTo,
    search,
    sortBy = "dateEvent",
    sortOrder = "asc",
    limit,
    offset,
  } = context.req.query();

  const userIds = await getUserIdsInPair(user.id);
  const where: any = { userId: { in: userIds } };

  if (sectionIds) {
    const ids = sectionIds.split(",").filter(Boolean);
    if (ids.length) where.sectionId = { in: ids };
  }
  if (isCompleted !== undefined) where.isCompleted = isCompleted === "true";
  if (isPinned !== undefined) where.isPinned = isPinned === "true";
  if (dateFrom)
    where.dateEvent = { ...where.dateEvent, gte: new Date(dateFrom) };
  if (dateTo) where.dateEvent = { ...where.dateEvent, lte: new Date(dateTo) };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }
  if (tags) {
    const tagList = tags.split(",").filter(Boolean);
    if (tagList.length) where.tags = { hasEvery: tagList };
  }

  const orderBy: any = {};
  if (sortBy === "dateEvent") orderBy.dateEvent = sortOrder;
  else if (sortBy === "createdAt") orderBy.createdAt = sortOrder;
  else if (sortBy === "updatedAt") orderBy.updatedAt = sortOrder;
  else if (sortBy === "title") orderBy.title = sortOrder;
  else orderBy.dateEvent = sortOrder;

  const take = limit ? parseInt(limit) : undefined;
  const skip = offset ? parseInt(offset) : undefined;

  const records = await prisma.record.findMany({
    where,
    orderBy,
    take,
    skip,
    include: { section: { select: { id: true, name: true, slug: true } } },
  });
  return context.json(records);
};

export const getUpdates = async (context: Context) => {
  const user = context.get("user");
  const since = context.req.query("since");
  const userIds = await getUserIdsInPair(user.id);
  const where: any = { userId: { in: userIds } };
  if (since) where.updatedAt = { gt: new Date(since) };
  const records = await prisma.record.findMany({
    where,
    include: { section: { select: { id: true, name: true, slug: true } } },
  });
  return context.json(records);
};

export const createRecord = async (context: Context) => {
  const user = context.get("user");
  const {
    sectionId,
    sectionSlug,
    title,
    content,
    dateEvent,
    isCompleted,
    tags,
    metadata,
  } = await context.req.json();

  const pairId = await getPairId(user.id);
  if (!pairId) return context.json({ message: "У вас нет пары" }, 400);

  let finalSectionId = sectionId;
  if (!finalSectionId && sectionSlug) {
    const section = await prisma.section.findUnique({
      where: { pairId_slug: { pairId, slug: sectionSlug } },
    });
    if (!section) return context.json({ message: "Секция не найдена" }, 404);
    finalSectionId = section.id;
  }
  if (!finalSectionId)
    return context.json({ message: "Не указана секция" }, 400);

  const section = await prisma.section.findUnique({
    where: { id: finalSectionId },
  });
  if (!section || section.pairId !== pairId) {
    return context.json({ message: "Секция не найдена или недоступна" }, 404);
  }

  const record = await prisma.record.create({
    data: {
      userId: user.id,
      sectionId: finalSectionId,
      title,
      content,
      dateEvent: dateEvent ? new Date(dateEvent) : null,
      isCompleted: isCompleted || false,
      tags: tags || [],
      metadata: metadata || {},
    },
    include: { section: { select: { id: true, name: true, slug: true } } },
  });
  return context.json(record, 201);
};

export const updateRecord = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id")!;
  const { title, content, dateEvent, isCompleted, tags, metadata, sectionId } =
    await context.req.json();

  const existing = await prisma.record.findUnique({
    where: { id },
    include: { section: true },
  });
  if (!existing) {
    return context.json({ message: "Not found" }, 404);
  }
  const userIdsInPair = await getUserIdsInPair(existing.userId);
  if (!userIdsInPair.includes(user.id)) {
    return context.json({ message: "Not found" }, 404);
  }

  let finalSectionId = sectionId;
  if (finalSectionId) {
    const pairId = await getPairId(user.id);
    if (!pairId) return context.json({ message: "У вас нет пары" }, 400);
    const section = await prisma.section.findUnique({
      where: { id: finalSectionId },
    });
    if (!section || section.pairId !== pairId) {
      return context.json({ message: "Указанная секция недоступна" }, 404);
    }
  }

  const updated = await prisma.record.update({
    where: { id },
    data: {
      title,
      content,
      dateEvent: dateEvent ? new Date(dateEvent) : null,
      isCompleted,
      tags,
      metadata,
      sectionId: finalSectionId,
    },
    include: { section: { select: { id: true, name: true, slug: true } } },
  });
  return context.json(updated);
};

export const deleteRecord = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id")!;
  const existing = await prisma.record.findUnique({ where: { id } });
  if (!existing) {
    return context.json({ message: "Not found" }, 404);
  }
  const userIdsInPair = await getUserIdsInPair(existing.userId);
  if (!userIdsInPair.includes(user.id)) {
    return context.json({ message: "Not found" }, 404);
  }
  await prisma.record.delete({ where: { id } });
  return context.json({ message: "Deleted" });
};
