import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  getTableSections,
  createTableSection,
  updateTableSection,
  deleteTableSection,
  reorderTableSections,
  getTables,
  getTable,
  createTable,
  updateTable,
  deleteTable,
  reorderTables,
  createField,
  updateField,
  deleteField,
  reorderFields,
  createRow,
  deleteRow,
  reorderRows,
  updateCell,
  createOrUpdateCell,
  getCellsForTable,
} from "../controllers/tables.controller.js";

const tables = new Hono();

tables.use("*", authMiddleware);

tables.get("/sections", getTableSections);
tables.post("/sections", createTableSection);
tables.patch("/sections/:id", updateTableSection);
tables.delete("/sections/:id", deleteTableSection);
tables.post("/sections/reorder", reorderTableSections);

tables.get("/", getTables);
tables.get("/:id", getTable);
tables.post("/", createTable);
tables.patch("/:id", updateTable);
tables.delete("/:id", deleteTable);
tables.post("/reorder", reorderTables);

tables.post("/:tableId/fields", createField);
tables.patch("/fields/:id", updateField);
tables.delete("/fields/:id", deleteField);
tables.post("/fields/reorder", reorderFields);

tables.post("/:tableId/rows", createRow);
tables.delete("/rows/:id", deleteRow);
tables.post("/rows/reorder", reorderRows);

tables.patch("/cells/:id", updateCell);
tables.post("/cells", createOrUpdateCell);
tables.get("/:tableId/cells", getCellsForTable);

export default tables;
