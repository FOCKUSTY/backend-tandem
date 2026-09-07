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
import {
  addStarred,
  getStarred,
  removeStarred,
} from "../controllers/starred.controller.js";

const records = new Hono();

records.use("*", authMiddleware);

records.get("/", getRecords);
records.get("/updates", getUpdates);
records.get("/starred", getStarred);
records.get("/:id", getRecordById);

records.post("/", createRecord);
records.post("/starred", addStarred);

records.patch("/:id", updateRecord);
records.delete("/:id", deleteRecord);

records.delete("/starred/:id", removeStarred);

export default records;
