import { Hono } from "hono";
import {
  login,
  register,
  forgotPassword,
  resetPassword,
  refresh,
  logout,
  logoutAll,
  sessions,
  revokeSession,
  introspect,
} from "../controllers/auth.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const auth = new Hono();

// Публичные: refresh/logout работают по самому refresh-токену.
auth.post("/login", login);
auth.post("/register", register);
auth.post("/refresh", refresh);
auth.post("/logout", logout);
auth.post("/introspect", introspect);
auth.post("/forgot-password", forgotPassword);
auth.post("/reset-password", resetPassword);

// Нужен access-токен.
auth.get("/sessions", authMiddleware, sessions);
auth.delete("/sessions/:id", authMiddleware, revokeSession);
auth.post("/logout-all", authMiddleware, logoutAll);

export default auth;
