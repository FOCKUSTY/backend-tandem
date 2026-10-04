import { MiddlewareHandler } from "hono";
import { verifyAccessToken } from "../jwt.js";

export const authMiddleware: MiddlewareHandler = async (context, next) => {
  const authHeader = context.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return context.json({ message: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return context.json(
      { message: "Invalid or expired token", code: "INVALID_ACCESS_TOKEN" },
      401,
    );
  }

  context.set("user", { id: decoded.id, username: decoded.username });

  await next();
};
