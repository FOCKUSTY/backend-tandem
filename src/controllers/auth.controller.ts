import { Context } from 'hono';
import bcrypt from 'bcryptjs';

import { sign } from '../jwt.js';
import prisma from '../prisma/index.js';

export const login = async (context: Context) => {
  const { username, password } = await context.req.json();

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return context.json({ message: 'Invalid credentials' }, 401);
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return context.json({ message: 'Invalid credentials' }, 401);
  }

  const token = sign({ id: user.id, username: user.username });
  return context.json({ token, user: { id: user.id, username: user.username, name: user.name } });
};
