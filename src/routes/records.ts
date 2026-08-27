import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  getRecords,
  getUpdates,
  createRecord,
  updateRecord,
  deleteRecord,
  getRecordById,
} from "../controllers/records.controller.js";

const records = new Hono();
records.use("*", authMiddleware);
records.get("/", getRecords);
records.get("/updates", getUpdates);
records.post("/", createRecord);
records.get("/:id", getRecordById);
records.patch("/:id", updateRecord);
records.delete("/:id", deleteRecord);

export default records;
