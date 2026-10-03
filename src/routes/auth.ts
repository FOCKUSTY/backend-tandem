import { Hono } from "hono";
import {
  login,
  register,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller.js";

const auth = new Hono();
auth.post("/login", login);
auth.post("/register", register);
auth.post("/forgot-password", forgotPassword);
auth.post("/reset-password", resetPassword);

export default auth;
