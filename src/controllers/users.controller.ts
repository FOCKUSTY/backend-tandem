import type { Context } from "hono";
import prisma from "../prisma/index.js";

export const linkPartner = async (context: Context) => {
  const user = context.get('user');
  const { partnerUsername } = await context.req.json();

  const partner = await prisma.user.findUnique({
    where: { username: partnerUsername }
  });
  if (!partner) return context.json({ message: 'User not found' }, 404);

  if (partner.partnerId) {
    return context.json({ message: 'Partner already linked' }, 400);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { partnerId: partner.id }
    }),
    prisma.user.update({
      where: { id: partner.id },
      data: { partnerId: user.id }
    })
  ]);

  return context.json({ message: 'Linked successfully' });
};