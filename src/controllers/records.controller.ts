import { Context } from "hono";
import prisma from "../prisma/index.js";
import { getNextRecurringDate, validateInterval } from "../utils/recurring.js";

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

function processRecurringRecords(records: any[]): any[] {
  return records.map((record) => {
    if (record.isRecurring && record.recurringInterval && record.dateEvent) {
      record.dateEvent = getNextRecurringDate(
        record.dateEvent,
        record.recurringInterval,
      );
    }
    return record;
  });
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

  const favorite = await prisma.userFavoritesRecord.findUnique({
    where: {
      userId_recordId: {
        userId: user.id,
        recordId: record.id,
      },
    },
  });
  const isStarred = !!favorite;

  const processed = processRecurringRecords([record]);
  return context.json({ ...processed[0], isStarred });
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

  const starredRecords = await prisma.userFavoritesRecord.findMany({
    where: { userId: user.id },
    select: { recordId: true },
  });
  const starredIds = new Set(
    starredRecords.map((favorite) => favorite.recordId),
  );

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

  const recordsWithFavorite = records.map((record) => ({
    ...record,
    isStarred: starredIds.has(record.id),
  }));

  const processed = processRecurringRecords(recordsWithFavorite);
  return context.json(processed);
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
  const processed = processRecurringRecords(records);
  return context.json(processed);
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
    isRecurring,
    recurringInterval,
  } = await context.req.json();

  if (isRecurring && recurringInterval) {
    if (!validateInterval(recurringInterval)) {
      return context.json({ message: "Некорректный интервал повторения" }, 400);
    }
  }

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
      isRecurring: isRecurring || false,
      recurringInterval: isRecurring ? recurringInterval : null,
    },
    include: { section: { select: { id: true, name: true, slug: true } } },
  });
  return context.json(record, 201);
};

export const updateRecord = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id")!;
  const {
    title,
    content,
    dateEvent,
    isCompleted,
    tags,
    metadata,
    sectionId,
    isRecurring,
    recurringInterval,
  } = await context.req.json();

  if (isRecurring && recurringInterval) {
    if (!validateInterval(recurringInterval)) {
      return context.json({ message: "Некорректный интервал повторения" }, 400);
    }
  }

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
      isRecurring:
        isRecurring !== undefined ? isRecurring : existing.isRecurring,
      recurringInterval: isRecurring ? recurringInterval : null,
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

  await prisma.userFavoritesRecord.deleteMany({
    where: { recordId: id },
  });

  await prisma.record.delete({ where: { id } });
  return context.json({ message: "Deleted" });
};
