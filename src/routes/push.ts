import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  registerToken,
  unregisterToken,
  sendToPartner,
} from "../controllers/push.controller.js";

const push = new Hono();

push.use("*", authMiddleware);

push.post("/register", registerToken);
push.post("/unregister", unregisterToken);
push.post("/send-to-partner", sendToPartner);

export default push;
