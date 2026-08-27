import { Context } from "hono";
import prisma from "../prisma/index.js";

export const getSections = async (context: Context) => {
  const user = context.get("user");

  const sections = await prisma.section.findMany({
    where: { userId: user.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      isSystem: true,
      order: true,
      _count: {
        select: { records: true },
      },
    },
  });

  return context.json(sections);
};

export const createSection = async (context: Context) => {
  const user = context.get("user");
  const { name, slug, order } = await context.req.json();

  if (!name || name.trim().length === 0) {
    return context.json({ message: "Название секции обязательно" }, 400);
  }

  let finalSlug = slug;
  if (!finalSlug) {
    finalSlug = name
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!finalSlug) finalSlug = `section-${Date.now()}`;
  }

  const existing = await prisma.section.findUnique({
    where: {
      userId_slug: {
        userId: user.id,
        slug: finalSlug,
      },
    },
  });

  if (existing) {
    return context.json(
      { message: "Секция с таким идентификатором уже существует" },
      400,
    );
  }

  let finalOrder = order;
  if (finalOrder === undefined) {
    const maxOrder = await prisma.section.aggregate({
      where: { userId: user.id },
      _max: { order: true },
    });
    finalOrder = (maxOrder._max.order ?? -1) + 1;
  }

  const section = await prisma.section.create({
    data: {
      userId: user.id,
      name: name.trim(),
      slug: finalSlug,
      isSystem: false,
      order: finalOrder,
    },
  });

  return context.json(section, 201);
};

export const updateSection = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");
  const { name, order } = await context.req.json();

  const section = await prisma.section.findUnique({
    where: { id },
  });

  if (!section || section.userId !== user.id) {
    return context.json({ message: "Секция не найдена" }, 404);
  }

  if (section.isSystem && name && name !== section.name) {
    return context.json(
      { message: "Системные секции нельзя переименовывать" },
      403,
    );
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (order !== undefined) updateData.order = order;

  const updated = await prisma.section.update({
    where: { id },
    data: updateData,
  });

  return context.json(updated);
};

export const deleteSection = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      _count: {
        select: { records: true },
      },
    },
  });

  if (!section || section.userId !== user.id) {
    return context.json({ message: "Секция не найдена" }, 404);
  }

  if (section.isSystem) {
    return context.json({ message: "Системные секции нельзя удалять" }, 403);
  }

  await prisma.section.delete({
    where: { id },
  });

  return context.json({ message: "Секция удалена" });
};
