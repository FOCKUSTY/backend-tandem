import { Hono } from "hono";
import { cors } from "hono/cors";

import authRoutes from "./routes/auth.js";
import recordsRoutes from "./routes/records.js";
import usersRoutes from "./routes/users.js";
import sectionsRoutes from "./routes/sections.js";
import pushRoutes from "./routes/push.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
  }),
);

app.route("/api/auth", authRoutes);
app.route("/api/records", recordsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/sections", sectionsRoutes);
app.route("/api/push", pushRoutes);
app.get("/health", (c) => c.json({ status: "ok" }));

console.log(
  app
    .all()
    .routes.map((route) => route.path)
    .join("\n"),
);

const port = parseInt(process.env.PORT || "8080");
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
