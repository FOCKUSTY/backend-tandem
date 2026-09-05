import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  registerDevice,
  unregisterDevice,
  getDevices,
  sendToPartner,
  getDevice,
} from "../controllers/push.controller.js";

const push = new Hono();

push.use("*", authMiddleware);

push.post("/register", registerDevice);
push.post("/unregister", unregisterDevice);
push.get("/devices", getDevices);
push.post("/send-to-partner", sendToPartner);
push.get("/device/:deviceId", getDevice);

export default push;
