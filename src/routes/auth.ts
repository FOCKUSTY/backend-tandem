import { Hono } from "hono";
import { login } from "../controllers/auth.controller.js";

const auth = new Hono();
auth.post("/login", login);

export default auth;
