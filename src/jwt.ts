import { env } from "./env.js";

import {
  sign as jwtSign,
  verify as jwtVerify
} from 'jsonwebtoken';

export const sign = (payload: { id: number; username: string }) => {
  return jwtSign(payload, env.JWT_SECRET, { expiresIn: '30d' });
};

export const verify = (token: string) => {
  try {
    return jwtVerify(token, env.JWT_SECRET) as { id: number; username: string };
  } catch {
    return null;
  }
};