import { Hono } from "hono";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  getMe,
  linkPartner,
  updateMe,
  changePassword,
} from "../controllers/users.controller.js";

const users = new Hono();

users.use("*", authMiddleware);
users.get("/me", getMe);
users.patch("/me", updateMe);
users.post("/me/password", changePassword);
users.post("/link", linkPartner);

export default users;
