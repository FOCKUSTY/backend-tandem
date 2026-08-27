import { MiddlewareHandler } from "hono";
import { verify } from "../jwt.js";

export const authMiddleware: MiddlewareHandler = async (context, next) => {
  console.log("Request:", context.req.method, context.req.path);

  const authHeader = context.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return context.json({ message: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const decoded = verify(token);
  if (!decoded) {
    return context.json({ message: "Invalid or expired token" }, 401);
  }

  context.set("user", decoded);

  await next();
};
