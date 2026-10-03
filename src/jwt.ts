import { env } from "./env.js";
import crypto from "crypto";

import { sign as jwtSign, verify as jwtVerify } from "jsonwebtoken";

/** Время жизни access-токена. Короткое — чтобы отзыв вступал в силу быстро. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 60 минут

/**
 * Refresh-токены — не JWT, а opaque-строки: в них нет полезной нагрузки,
 * а валидность определяется поиском SHA-256 хеша в таблице `RefreshToken`.
 * Так токен можно отозвать мгновенно, не дожидаясь истечения подписи.
 */
export type TokenType = "access" | "refresh";

export interface AccessPayload {
  id: string;
  username: string;
  type: TokenType;
  jti: string;
}

/**
 * Подписывает access-токен. В payload всегда попадает `type: "access"`,
 * и `verifyAccessToken` это проверяет — поэтому строку, выданную как
 * refresh-токен, нельзя предъявить в качестве bearer.
 */
export const sign = (payload: { id: string; username: string }) => {
  return jwtSign(
    {
      ...payload,
      type: "access" satisfies TokenType,
      jti: crypto.randomUUID(),
    },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
};

/** Возвращает payload access-токена либо null (битый, просроченный, не тот тип). */
export const verifyAccessToken = (token: string): AccessPayload | null => {
  try {
    const decoded = jwtVerify(token, env.JWT_SECRET);
    if (typeof decoded === "string") return null;
    if (decoded.type !== "access") return null;
    if (typeof decoded.id !== "string" || typeof decoded.jti !== "string") {
      return null;
    }

    return {
      id: decoded.id,
      username: typeof decoded.username === "string" ? decoded.username : "",
      type: "access",
      jti: decoded.jti,
    };
  } catch {
    return null;
  }
};

/** SHA-256 хеш токена — в БД храним только его. */
export const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
