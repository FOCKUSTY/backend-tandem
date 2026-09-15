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

export const getTableSections = async (context: Context) => {
  const user = context.get("user");
  const pairId = await getPairId(user.id);
  if (!pairId) return context.json([]);

  const sections = await prisma.tableSection.findMany({
    where: { pairId },
    orderBy: { order: "asc" },
    include: {
      tables: {
        select: {
          id: true,
          name: true,
          description: true,
          order: true,
          _count: {
            select: { rows: true, fields: true },
          },
        },
      },
    },
  });
  return context.json(sections);
};

export const createTableSection = async (context: Context) => {
  const user = context.get("user");
  const { name, slug, order } = await context.req.json();

  if (!name || name.trim().length === 0) {
    return context.json({ message: "Название обязательно" }, 400);
  }

  const pairId = await getPairId(user.id);
  if (!pairId) {
    return context.json({ message: "У вас нет пары" }, 400);
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

  const existing = await prisma.tableSection.findUnique({
    where: { pairId_slug: { pairId, slug: finalSlug } },
  });
  if (existing) {
    return context.json(
      { message: "Секция с таким идентификатором уже существует" },
      400,
    );
  }

  let finalOrder = order;
  if (finalOrder === undefined) {
    const maxOrder = await prisma.tableSection.aggregate({
      where: { pairId },
      _max: { order: true },
    });
    finalOrder = (maxOrder._max.order ?? -1) + 1;
  }

  const section = await prisma.tableSection.create({
    data: {
      pairId,
      name: name.trim(),
      slug: finalSlug,
      order: finalOrder,
    },
  });
  return context.json(section, 201);
};

export const updateTableSection = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");
  const { name, order } = await context.req.json();

  const pairId = await getPairId(user.id);
  if (!pairId) return context.json({ message: "У вас нет пары" }, 400);

  const section = await prisma.tableSection.findUnique({ where: { id } });
  if (!section || section.pairId !== pairId) {
    return context.json({ message: "Секция не найдена" }, 404);
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (order !== undefined) updateData.order = order;

  const updated = await prisma.tableSection.update({
    where: { id },
    data: updateData,
  });
  return context.json(updated);
};

export const deleteTableSection = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");

  const pairId = await getPairId(user.id);
  if (!pairId) return context.json({ message: "У вас нет пары" }, 400);

  const section = await prisma.tableSection.findUnique({
    where: { id },
    include: {
      tables: {
        include: {
          fields: true,
          rows: {
            include: { cells: true },
          },
        },
      },
    },
  });
  if (!section || section.pairId !== pairId) {
    return context.json({ message: "Секция не найдена" }, 404);
  }

  await prisma.$transaction(async (tx) => {
    const rowIds: string[] = [];
    const fieldIds: string[] = [];
    for (const table of section.tables) {
      for (const row of table.rows) {
        rowIds.push(row.id);
      }
      for (const field of table.fields) {
        fieldIds.push(field.id);
      }
    }
    if (rowIds.length > 0 && fieldIds.length > 0) {
      await tx.cell.deleteMany({
        where: {
          OR: [{ rowId: { in: rowIds } }, { fieldId: { in: fieldIds } }],
        },
      });
    }
    if (rowIds.length > 0) {
      await tx.row.deleteMany({ where: { id: { in: rowIds } } });
    }
    if (fieldIds.length > 0) {
      await tx.field.deleteMany({ where: { id: { in: fieldIds } } });
    }
    await tx.table.deleteMany({ where: { sectionId: id } });
    await tx.tableSection.delete({ where: { id } });
  });

  return context.json({ message: "Секция удалена" });
};

export const reorderTableSections = async (context: Context) => {
  const user = context.get("user");
  const { ids } = await context.req.json(); // массив id в новом порядке

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return context.json({ message: "Неверный формат" }, 400);
  }

  const pairId = await getPairId(user.id);
  if (!pairId) return context.json({ message: "У вас нет пары" }, 400);

  const sections = await prisma.tableSection.findMany({
    where: { id: { in: ids }, pairId },
  });
  if (sections.length !== ids.length) {
    return context.json({ message: "Некоторые секции не найдены" }, 404);
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.tableSection.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );

  return context.json({ success: true });
};

export const getTables = async (context: Context) => {
  const user = context.get("user");
  const pairId = await getPairId(user.id);
  if (!pairId) return context.json([]);

  const tables = await prisma.table.findMany({
    where: { section: { pairId } },
    orderBy: { order: "asc" },
    include: {
      section: { select: { id: true, name: true } },
      _count: { select: { rows: true, fields: true } },
    },
  });
  return context.json(tables);
};

export const getTable = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");

  const table = await prisma.table.findUnique({
    where: { id },
    include: {
      section: { select: { id: true, name: true, pairId: true } },
      fields: { orderBy: { order: "asc" } },
      rows: {
        orderBy: { order: "asc" },
        include: { cells: true },
      },
    },
  });
  if (!table) {
    return context.json({ message: "Таблица не найдена" }, 404);
  }

  const pairId = await getPairId(user.id);
  if (table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  const rowsWithCells = table.rows.map((row) => ({
    ...row,
    cells: row.cells.reduce(
      (acc, cell) => {
        acc[cell.fieldId] = cell.value;
        return acc;
      },
      {} as Record<string, string>,
    ),
  }));

  return context.json({
    ...table,
    rows: rowsWithCells,
  });
};

export const createTable = async (context: Context) => {
  const user = context.get("user");
  const { sectionId, name, description, order } = await context.req.json();

  if (!name || name.trim().length === 0) {
    return context.json({ message: "Название обязательно" }, 400);
  }
  if (!sectionId) {
    return context.json({ message: "Не указана секция" }, 400);
  }

  const pairId = await getPairId(user.id);
  if (!pairId) return context.json({ message: "У вас нет пары" }, 400);

  const section = await prisma.tableSection.findUnique({
    where: { id: sectionId },
  });
  if (!section || section.pairId !== pairId) {
    return context.json({ message: "Секция не найдена" }, 404);
  }

  let finalOrder = order;
  if (finalOrder === undefined) {
    const maxOrder = await prisma.table.aggregate({
      where: { sectionId },
      _max: { order: true },
    });
    finalOrder = (maxOrder._max.order ?? -1) + 1;
  }

  const table = await prisma.table.create({
    data: {
      sectionId,
      name: name.trim(),
      description: description?.trim(),
      order: finalOrder,
    },
  });
  return context.json(table, 201);
};

export const updateTable = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");
  const { name, description, order, sectionId } = await context.req.json();

  const table = await prisma.table.findUnique({
    where: { id },
    include: { section: true },
  });
  if (!table) return context.json({ message: "Таблица не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  let finalSectionId = sectionId;
  if (finalSectionId && finalSectionId !== table.sectionId) {
    const newSection = await prisma.tableSection.findUnique({
      where: { id: finalSectionId },
    });
    if (!newSection || newSection.pairId !== pairId) {
      return context.json({ message: "Новая секция не найдена" }, 404);
    }
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim();
  if (order !== undefined) updateData.order = order;
  if (finalSectionId) updateData.sectionId = finalSectionId;

  const updated = await prisma.table.update({
    where: { id },
    data: updateData,
  });
  return context.json(updated);
};

export const deleteTable = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");

  const table = await prisma.table.findUnique({
    where: { id },
    include: {
      section: true,
      fields: true,
      rows: { include: { cells: true } },
    },
  });
  if (!table) return context.json({ message: "Таблица не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  await prisma.$transaction(async (tx) => {
    const rowIds = table.rows.map((r) => r.id);
    const fieldIds = table.fields.map((f) => f.id);
    if (rowIds.length > 0 || fieldIds.length > 0) {
      await tx.cell.deleteMany({
        where: {
          OR: [{ rowId: { in: rowIds } }, { fieldId: { in: fieldIds } }],
        },
      });
    }
    if (rowIds.length > 0) {
      await tx.row.deleteMany({ where: { id: { in: rowIds } } });
    }
    if (fieldIds.length > 0) {
      await tx.field.deleteMany({ where: { id: { in: fieldIds } } });
    }
    await tx.table.delete({ where: { id } });
  });

  return context.json({ message: "Таблица удалена" });
};

export const reorderTables = async (context: Context) => {
  const user = context.get("user");
  const { sectionId, ids } = await context.req.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return context.json({ message: "Неверный формат" }, 400);
  }
  if (!sectionId) {
    return context.json({ message: "Не указана секция" }, 400);
  }

  const pairId = await getPairId(user.id);
  if (!pairId) return context.json({ message: "У вас нет пары" }, 400);

  const section = await prisma.tableSection.findUnique({
    where: { id: sectionId },
  });
  if (!section || section.pairId !== pairId) {
    return context.json({ message: "Секция не найдена" }, 404);
  }

  const tables = await prisma.table.findMany({
    where: { id: { in: ids }, sectionId },
  });
  if (tables.length !== ids.length) {
    return context.json({ message: "Некоторые таблицы не найдены" }, 404);
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.table.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );

  return context.json({ success: true });
};

export const createField = async (context: Context) => {
  const user = context.get("user");
  const tableId = context.req.param("tableId")!;
  const { name, type, required, options, defaultValue, order } =
    await context.req.json();

  if (!name || name.trim().length === 0) {
    return context.json({ message: "Название поля обязательно" }, 400);
  }
  if (!type) {
    return context.json({ message: "Тип поля обязателен" }, 400);
  }
  const validTypes = [
    "text",
    "number",
    "date",
    "boolean",
    "select",
    "multiline",
  ];
  if (!validTypes.includes(type)) {
    return context.json(
      { message: `Недопустимый тип. Допустимые: ${validTypes.join(", ")}` },
      400,
    );
  }
  if (type === "select" && (!options || options.length === 0)) {
    return context.json(
      { message: "Для типа select необходимо указать options" },
      400,
    );
  }

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: { section: true },
  });
  if (!table) return context.json({ message: "Таблица не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  // Проверяем уникальность имени в таблице
  const existing = await prisma.field.findFirst({
    where: { tableId, name: name.trim() },
  });
  if (existing) {
    return context.json({ message: "Поле с таким именем уже существует" }, 400);
  }

  let finalOrder = order;
  if (finalOrder === undefined) {
    const maxOrder = await prisma.field.aggregate({
      where: { tableId },
      _max: { order: true },
    });
    finalOrder = (maxOrder._max.order ?? -1) + 1;
  }

  const field = await prisma.field.create({
    data: {
      tableId,
      name: name.trim(),
      type,
      required: required || false,
      options: options || [],
      defaultValue: defaultValue || null,
      order: finalOrder,
    },
  });
  return context.json(field, 201);
};

export const updateField = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");
  const { name, type, required, options, defaultValue, order } =
    await context.req.json();

  const field = await prisma.field.findUnique({
    where: { id },
    include: { table: { include: { section: true } } },
  });
  if (!field) return context.json({ message: "Поле не найдено" }, 404);

  const pairId = await getPairId(user.id);
  if (field.table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  if (
    type &&
    !["text", "number", "date", "boolean", "select", "multiline"].includes(type)
  ) {
    return context.json({ message: "Недопустимый тип" }, 400);
  }
  if (type === "select" && options && options.length === 0) {
    return context.json({ message: "Для типа select нужны options" }, 400);
  }

  if (name && name.trim() !== field.name) {
    const existing = await prisma.field.findFirst({
      where: {
        tableId: field.tableId,
        name: name.trim(),
        id: { not: id },
      },
    });
    if (existing) {
      return context.json(
        { message: "Поле с таким именем уже существует" },
        400,
      );
    }
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (type !== undefined) updateData.type = type;
  if (required !== undefined) updateData.required = required;
  if (options !== undefined) updateData.options = options;
  if (defaultValue !== undefined) updateData.defaultValue = defaultValue;
  if (order !== undefined) updateData.order = order;

  const updated = await prisma.field.update({
    where: { id },
    data: updateData,
  });
  return context.json(updated);
};

export const deleteField = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");

  const field = await prisma.field.findUnique({
    where: { id },
    include: { table: { include: { section: true } } },
  });
  if (!field) return context.json({ message: "Поле не найдено" }, 404);

  const pairId = await getPairId(user.id);
  if (field.table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  await prisma.cell.deleteMany({ where: { fieldId: id } });
  await prisma.field.delete({ where: { id } });

  return context.json({ message: "Поле удалено" });
};

export const reorderFields = async (context: Context) => {
  const user = context.get("user");
  const { tableId, ids } = await context.req.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return context.json({ message: "Неверный формат" }, 400);
  }
  if (!tableId) {
    return context.json({ message: "Не указана таблица" }, 400);
  }

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: { section: true },
  });
  if (!table) return context.json({ message: "Таблица не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  const fields = await prisma.field.findMany({
    where: { id: { in: ids }, tableId },
  });
  if (fields.length !== ids.length) {
    return context.json({ message: "Некоторые поля не найдены" }, 404);
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.field.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );

  return context.json({ success: true });
};

export const createRow = async (context: Context) => {
  const user = context.get("user");
  const tableId = context.req.param("tableId")!;
  const { order } = await context.req.json();

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: { section: true },
  });
  if (!table) return context.json({ message: "Таблица не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  let finalOrder = order;
  if (finalOrder === undefined) {
    const maxOrder = await prisma.row.aggregate({
      where: { tableId },
      _max: { order: true },
    });
    finalOrder = (maxOrder._max.order ?? -1) + 1;
  }

  const row = await prisma.row.create({
    data: {
      tableId,
      order: finalOrder,
    },
  });
  return context.json(row, 201);
};

export const deleteRow = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");

  const row = await prisma.row.findUnique({
    where: { id },
    include: { table: { include: { section: true } } },
  });
  if (!row) return context.json({ message: "Строка не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (row.table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  await prisma.cell.deleteMany({ where: { rowId: id } });
  await prisma.row.delete({ where: { id } });

  return context.json({ message: "Строка удалена" });
};

export const reorderRows = async (context: Context) => {
  const user = context.get("user");
  const { tableId, ids } = await context.req.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return context.json({ message: "Неверный формат" }, 400);
  }
  if (!tableId) {
    return context.json({ message: "Не указана таблица" }, 400);
  }

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: { section: true },
  });
  if (!table) return context.json({ message: "Таблица не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  const rows = await prisma.row.findMany({
    where: { id: { in: ids }, tableId },
  });
  if (rows.length !== ids.length) {
    return context.json({ message: "Некоторые строки не найдены" }, 404);
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.row.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );

  return context.json({ success: true });
};

function validateCellValue(value: string, field: any): boolean {
  switch (field.type) {
    case "text":
    case "multiline":
      return typeof value === "string";
    case "number":
      return !isNaN(Number(value));
    case "date":
      return !isNaN(Date.parse(value));
    case "boolean":
      return value === "true" || value === "false";
    case "select":
      return field.options.includes(value);
    default:
      return false;
  }
}

export const updateCell = async (context: Context) => {
  const user = context.get("user");
  const id = context.req.param("id");
  const { value } = await context.req.json();

  const cell = await prisma.cell.findUnique({
    where: { id },
    include: {
      row: { include: { table: { include: { section: true } } } },
      field: true,
    },
  });
  if (!cell) return context.json({ message: "Ячейка не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (cell.row.table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  if (!validateCellValue(value, cell.field)) {
    return context.json(
      { message: `Некорректное значение для типа ${cell.field.type}` },
      400,
    );
  }

  if (
    cell.field.required &&
    (value === undefined || value === null || value === "")
  ) {
    return context.json({ message: "Поле обязательно для заполнения" }, 400);
  }

  const updated = await prisma.cell.update({
    where: { id },
    data: { value: value ?? "" },
  });
  return context.json(updated);
};

export const createOrUpdateCell = async (context: Context) => {
  const user = context.get("user");
  const { rowId, fieldId, value } = await context.req.json();

  if (!rowId || !fieldId) {
    return context.json({ message: "rowId и fieldId обязательны" }, 400);
  }

  const row = await prisma.row.findUnique({
    where: { id: rowId },
    include: { table: { include: { section: true } } },
  });
  if (!row) return context.json({ message: "Строка не найдена" }, 404);

  const field = await prisma.field.findUnique({
    where: { id: fieldId },
    include: { table: { include: { section: true } } },
  });
  if (!field) return context.json({ message: "Поле не найдено" }, 404);

  const pairId = await getPairId(user.id);
  if (
    row.table.section.pairId !== pairId ||
    field.table.section.pairId !== pairId
  ) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  if (!validateCellValue(value, field)) {
    return context.json(
      { message: `Некорректное значение для типа ${field.type}` },
      400,
    );
  }

  const cell = await prisma.cell.upsert({
    where: {
      rowId_fieldId: { rowId, fieldId },
    },
    update: { value: value ?? "" },
    create: {
      rowId,
      fieldId,
      value: value ?? "",
    },
  });

  return context.json(cell);
};

export const getCellsForTable = async (context: Context) => {
  const user = context.get("user");
  const tableId = context.req.param("tableId");

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: { section: true },
  });
  if (!table) return context.json({ message: "Таблица не найдена" }, 404);

  const pairId = await getPairId(user.id);
  if (table.section.pairId !== pairId) {
    return context.json({ message: "Доступ запрещён" }, 403);
  }

  const rows = await prisma.row.findMany({
    where: { tableId },
    include: { cells: true },
    orderBy: { order: "asc" },
  });
  return context.json(rows);
};
