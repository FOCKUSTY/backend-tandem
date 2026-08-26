import { Hono } from "hono";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { linkPartner } from "../controllers/users.controller.js";

const users = new Hono();

users.use("*", authMiddleware);
users.post("/link", linkPartner);

export default users;
