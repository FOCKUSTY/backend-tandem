import { Context } from 'hono';
import prisma from '../prisma/index.js';

export const getRecords = async (context: Context) => {
  const user = context.get('user');
  const section = context.req.query('section');
  const where = { userId: user.id, section: section };

  const records = await prisma.record.findMany({
    where,
    orderBy: { dateEvent: 'asc' }
  });

  return context.json(records);
};

export const getUpdates = async (context: Context) => {
  const user = context.get('user');
  const since = context.req.query('since');
  const where: any = { userId: user.id };
  if (since) {
    where.updatedAt = { gt: new Date(since) };
  }

  const records = await prisma.record.findMany({ where });
  return context.json(records);
};

export const createRecord = async (context: Context) => {
  const user = context.get('user');
  const { section, title, content, dateEvent, isCompleted, tags, metadata } = await context.req.json();

  const record = await prisma.record.create({
    data: {
      userId: user.id,
      section,
      title,
      content,
      dateEvent: dateEvent ? new Date(dateEvent) : null,
      isCompleted: isCompleted || false,
      tags: tags || [],
      metadata: metadata || {}
    }
  });

  return context.json(record, 201);
};

export const updateRecord = async (context: Context) => {
  const user = context.get('user');
  const id = parseInt(context.req.param('id')!);
  const { title, content, dateEvent, isCompleted, tags, metadata } = await context.req.json();

  const existing = await prisma.record.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return context.json({ message: 'Not found' }, 404);
  }

  const updated = await prisma.record.update({
    where: { id },
    data: {
      title,
      content,
      dateEvent: dateEvent ? new Date(dateEvent) : null,
      isCompleted,
      tags,
      metadata
    }
  });
  
  return context.json(updated);
};

export const deleteRecord = async (context: Context) => {
  const user = context.get('user');
  const id = parseInt(context.req.param('id')!);

  const existing = await prisma.record.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return context.json({ message: 'Not found' }, 404);
  }

  await prisma.record.delete({ where: { id } });
  return context.json({ message: 'Deleted' });
};