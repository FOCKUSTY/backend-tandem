import { Hono } from "hono";
import { login, register } from "../controllers/auth.controller.js";

const auth = new Hono();
auth.post("/login", login);
auth.post("/register", register);

export default auth;
