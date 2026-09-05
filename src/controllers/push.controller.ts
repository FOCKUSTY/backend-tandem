import { Context } from "hono";
import { Expo } from "expo-server-sdk";
import prisma from "../prisma/index.js";

const expo = new Expo();

export const registerDevice = async (context: Context) => {
  const user = context.get("user");
  const { deviceId, pushToken, platform, osVersion, appVersion, model } =
    await context.req.json();

  if (!deviceId) {
    return context.json({ error: "deviceId is required" }, 400);
  }

  if (pushToken && !Expo.isExpoPushToken(pushToken)) {
    return context.json({ error: "Invalid Expo push token" }, 400);
  }

  const device = await prisma.device.upsert({
    where: { deviceId },
    update: {
      userId: user.id,
      pushToken: pushToken || null,
      platform,
      osVersion,
      appVersion,
      model,
      lastActiveAt: new Date(),
    },
    create: {
      userId: user.id,
      deviceId,
      pushToken: pushToken || null,
      platform,
      osVersion,
      appVersion,
      model,
      lastActiveAt: new Date(),
    },
  });

  return context.json({ success: true, device });
};

export const unregisterDevice = async (context: Context) => {
  const user = context.get("user");
  const { deviceId } = await context.req.json();

  if (!deviceId) {
    return context.json({ error: "deviceId is required" }, 400);
  }

  await prisma.device.updateMany({
    where: { deviceId, userId: user.id },
    data: { pushToken: null },
  });

  return context.json({ success: true });
};

export const getDevices = async (context: Context) => {
  const user = context.get("user");
  const devices = await prisma.device.findMany({
    where: { userId: user.id },
    select: {
      deviceId: true,
      platform: true,
      osVersion: true,
      appVersion: true,
      model: true,
      pushToken: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
  return context.json(devices);
};

export const getDevice = async (context: Context) => {
  const user = context.get("user");
  const deviceId = context.req.param("deviceId");

  if (!deviceId) {
    return context.json({ error: "deviceId is required" }, 400);
  }

  const device = await prisma.device.findUnique({
    where: { deviceId },
  });

  if (!device) {
    return context.json({ exists: false }, 404);
  }

  if (device.userId !== user.id) {
    return context.json(
      {
        exists: true,
        belongsToCurrentUser: false,
        message: "Device belongs to another user",
      },
      403,
    );
  }

  return context.json({ exists: true, belongsToCurrentUser: true, device });
};

export const sendToPartner = async (context: Context) => {
  const user = context.get("user");
  const { message } = await context.req.json();

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return context.json({ error: "Message is required" }, 400);
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      pair: {
        include: {
          userA: { include: { devices: true } },
          userB: { include: { devices: true } },
        },
      },
    },
  });

  if (!currentUser?.pair) {
    return context.json({ error: "У вас нет привязанного партнёра" }, 400);
  }

  const partner =
    currentUser.pair.userA.id === user.id
      ? currentUser.pair.userB
      : currentUser.pair.userA;

  const devicesWithToken = partner.devices.filter((d) => d.pushToken);
  if (devicesWithToken.length === 0) {
    return context.json(
      { error: "У партнёра нет активных устройств с уведомлениями" },
      404,
    );
  }

  const messages = devicesWithToken.map((d) => ({
    to: d.pushToken!,
    sound: "default",
    title: `${currentUser.name || currentUser.username} отправил(а) сообщение`,
    body: message.trim(),
    data: {
      senderId: user.id,
      type: "partner_message",
      message: message.trim(),
    },
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error("Expo push error:", error);
      return context.json({ error: "Ошибка при отправке уведомления" }, 500);
    }
  }

  return context.json({ success: true, tickets });
};
