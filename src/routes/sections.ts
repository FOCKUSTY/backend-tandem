import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  getSections,
  createSection,
  updateSection,
  deleteSection,
} from "../controllers/sections.controller.js";

const sections = new Hono();
sections.use("*", authMiddleware);
sections.get("/", getSections);
sections.post("/", createSection);
sections.patch("/:id", updateSection);
sections.delete("/:id", deleteSection);

export default sections;
