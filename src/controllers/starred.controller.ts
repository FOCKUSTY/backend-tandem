import { Context } from "hono";
import prisma from "../prisma/index.js";

export const addStarred = async (context: Context) => {
  const user = context.get("user");
  const { recordId } = await context.req.json();

  if (!recordId) {
    return context.json({ message: "recordId required" }, 400);
  }

  const record = await prisma.record.findUnique({
    where: { id: recordId },
    include: { user: { select: { pairId: true } } },
  });
  if (!record) {
    return context.json({ message: "Record not found" }, 404);
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { pairId: true },
  });
  if (!currentUser?.pairId || currentUser.pairId !== record.user.pairId) {
    return context.json({ message: "Access denied" }, 403);
  }

  await prisma.userFavoritesRecord.upsert({
    where: { userId_recordId: { userId: user.id, recordId } },
    update: {},
    create: { userId: user.id, recordId },
  });

  return context.json({ success: true });
};

export const removeStarred = async (context: Context) => {
  const user = context.get("user");
  const { id } = context.req.param();

  if (!id) {
    return context.json({ message: "recordId required" }, 400);
  }

  await prisma.userFavoritesRecord.delete({
    where: { userId_recordId: { userId: user.id, recordId: id } },
  });

  return context.json({ success: true });
};

export const getStarred = async (context: Context) => {
  const user = context.get("user");

  const starredRecords = await prisma.userFavoritesRecord.findMany({
    where: { userId: user.id },
    include: {
      record: {
        include: { section: { select: { id: true, name: true, slug: true } } },
      },
    },
    orderBy: { record: { createdAt: "desc" } },
  });

  const records = starredRecords.map((favorite) => ({
    ...favorite.record,
    isStarred: true,
  }));

  return context.json(records);
};
