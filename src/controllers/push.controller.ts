import { Context } from "hono";
import { Expo } from "expo-server-sdk";
import prisma from "../prisma/index.js";

const expo = new Expo();

async function getPairId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pairId: true },
  });
  return user?.pairId ?? null;
}

export const registerToken = async (context: Context) => {
  const user = context.get("user");
  const { token } = await context.req.json();

  if (!token) {
    return context.json({ error: "Token is required" }, 400);
  }

  if (!Expo.isExpoPushToken(token)) {
    return context.json({ error: "Invalid Expo push token" }, 400);
  }

  await prisma.pushToken.upsert({
    where: { token },
    update: { userId: user.id },
    create: { userId: user.id, token },
  });

  return context.json({ success: true });
};

export const unregisterToken = async (context: Context) => {
  const { token } = await context.req.json();

  if (!token) {
    return context.json({ error: "Token is required" }, 400);
  }

  await prisma.pushToken.deleteMany({ where: { token } });
  return context.json({ success: true });
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
          userA: { include: { pushTokens: true } },
          userB: { include: { pushTokens: true } },
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

  const pushTokenRecord = partner.pushTokens[0];
  if (!pushTokenRecord) {
    return context.json({ error: "У партнёра не настроены уведомления" }, 404);
  }

  const partnerToken = pushTokenRecord.token;
  if (!Expo.isExpoPushToken(partnerToken)) {
    return context.json({ error: "Невалидный push-токен партнёра" }, 400);
  }

  const messages = [
    {
      to: partnerToken,
      sound: "default",
      title: `${currentUser.name || currentUser.username} отправил(а) сообщение`,
      body: message.trim(),
      data: {
        senderId: user.id,
        type: "partner_message",
        message: message.trim(),
      },
    },
  ];

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
