import crypto from "crypto";
import prisma from "../prisma/index.js";
import { ACCESS_TOKEN_TTL_SECONDS, hashToken, sign } from "../jwt.js";

/**
 * Хранилище сессий и refresh-токенов.
 *
 * Схема: одна сессия (`Session`) = один вход с устройства. Внутри сессии
 * refresh-токены ротируются: при каждом `/auth/refresh` старый токен
 * помечается использованным, выдаётся новый. Если помеченный использованным
 * токен приходит снова (утечка/копия), вся сессия отзывается — reuse detection.
 */

export interface SessionMetadata {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  userAgent?: string;
  ip?: string;
}

interface HeaderSource {
  req: {
    header(name: string): string | undefined;
  };
}

/**
 * Собирает метаданные устройства из тела запроса (плоско или внутри
 * `device`) и из заголовков. Тело принимается уже разобранным, чтобы
 * контроллеры читали его один раз.
 */
export const sessionMetadataFrom = (
  context: HeaderSource,
  body: Record<string, unknown> = {},
): SessionMetadata => {
  const device = (body.device ?? {}) as Record<string, unknown>;
  const pick = (value: unknown) =>
    typeof value === "string" && value.trim() !== ""
      ? value.trim().slice(0, 512)
      : undefined;

  return {
    deviceId: pick(body.deviceId) ?? pick(device.id),
    deviceName: pick(body.deviceName) ?? pick(device.name),
    platform: pick(body.platform) ?? pick(device.platform),
    appVersion: pick(body.appVersion) ?? pick(device.appVersion),
    userAgent: context.req.header("User-Agent"),
    ip:
      context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      context.req.header("x-real-ip") ??
      undefined,
  };
};

/** Варианты "запомнить устройство": числа — дни, "forever" — бессрочно. */
export type RememberChoice = number | "forever";

const DEFAULT_REMEMBER_DAYS = 90;
const MAX_REMEMBER_DAYS = 365 * 5;
/** Не больше стольких активных сессий у пользователя — старые отзываются. */
const MAX_ACTIVE_SESSIONS = 20;

export const normalizeRememberChoice = (value: unknown): RememberChoice => {
  if (value === "forever" || value === "infinite" || value === "never") {
    return "forever";
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(Math.floor(value), MAX_REMEMBER_DAYS);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.floor(parsed), MAX_REMEMBER_DAYS);
    }
  }
  return DEFAULT_REMEMBER_DAYS;
};

export const createRefreshToken = () => crypto.randomBytes(48).toString("hex");

const expiresAtFor = (remember: RememberChoice, from = new Date()) => {
  if (remember === "forever") return null;
  return new Date(from.getTime() + remember * 24 * 60 * 60 * 1000);
};

const publicUser = (user: {
  id: string;
  username: string;
  name?: string | null;
  email?: string | null;
}) => ({
  id: user.id,
  username: user.username,
  name: user.name ?? null,
  email: user.email ?? null,
});

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string | null;
  sessionId: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    email: string | null;
  };
}

const buildPayload = (
  user: {
    id: string;
    username: string;
    name?: string | null;
    email?: string | null;
  },
  sessionId: string,
  refreshToken: string,
  refreshTokenExpiresAt: Date | null,
): AuthPayload => ({
  accessToken: sign({ id: user.id, username: user.username }),
  refreshToken,
  accessTokenExpiresAt: new Date(
    Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
  ).toISOString(),
  refreshTokenExpiresAt: refreshTokenExpiresAt
    ? refreshTokenExpiresAt.toISOString()
    : null,
  sessionId,
  user: publicUser(user),
});

/** Отзывает все сессии пользователя (например, при смене пароля). */
export const revokeAllSessions = async (userId: string, reason: string) => {
  const now = new Date();
  await prisma.$transaction([
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
};

/** Создаёт новую сессию и возвращает пару токенов. */
export const createSession = async (
  user: {
    id: string;
    username: string;
    name?: string | null;
    email?: string | null;
  },
  metadata: SessionMetadata = {},
  remember: RememberChoice = DEFAULT_REMEMBER_DAYS,
): Promise<AuthPayload> => {
  const now = new Date();
  const expiresAt = expiresAtFor(remember, now);
  const refreshToken = createRefreshToken();

  // Держим не больше MAX_ACTIVE_SESSIONS активных сессий: самые старые
  // (по lastUsedAt) отзываем, освобождая место под новую.
  const stale = (
    await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { lastUsedAt: "desc" },
      skip: MAX_ACTIVE_SESSIONS - 1,
      select: { id: true },
    })
  ).map((session) => session.id);

  const session = await prisma.$transaction(async (tx) => {
    if (stale.length > 0) {
      await tx.session.updateMany({
        where: { id: { in: stale } },
        data: { revokedAt: now, revokedReason: "session_limit" },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId: { in: stale }, revokedAt: null },
        data: { revokedAt: now },
      });
    }

    const created = await tx.session.create({
      data: {
        userId: user.id,
        deviceId: metadata.deviceId ?? null,
        deviceName: metadata.deviceName ?? null,
        platform: metadata.platform ?? null,
        appVersion: metadata.appVersion ?? null,
        userAgent: metadata.userAgent ?? null,
        ip: metadata.ip ?? null,
        expiresAt,
      },
      select: { id: true },
    });

    await tx.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        sessionId: created.id,
        userId: user.id,
        expiresAt,
      },
    });

    await tx.device.updateMany({
      where: { userId: user.id, deviceId: metadata.deviceId ?? "" },
      data: { lastActiveAt: now },
    });

    return created;
  });

  return buildPayload(user, session.id, refreshToken, expiresAt);
};

export type RotateResult =
  | { status: "ok"; auth: AuthPayload }
  | { status: "invalid" }
  | { status: "reuse"; sessionId: string };

/**
 * Обменивает refresh-токен на новую пару токенов.
 *
 * Refresh-токен — это opaque-строка (48 случайных байт), а не JWT: он не несёт
 * полезной нагрузки, а проверяется поиском SHA-256 хеша в БД. Поэтому решение
 * «валиден или нет» принимает только БД, и отозвать токен можно мгновенно.
 */
export const rotateRefreshToken = async (
  token: string,
  metadata: SessionMetadata = {},
): Promise<RotateResult> => {
  if (typeof token !== "string" || token.length < 32) {
    return { status: "invalid" };
  }

  const now = new Date();
  const stored = await prisma.refreshToken.findFirst({
    where: { tokenHash: hashToken(token) },
    include: { session: true },
  });

  // Токена нет в БД: подделка, отозванный или вычищенный токен.
  if (!stored) return { status: "invalid" };

  // Повторное использование уже отданного токена — компрометация сессии.
  if (stored.usedAt) {
    await revokeSession(stored.sessionId, "refresh_token_reuse");
    return { status: "reuse", sessionId: stored.sessionId };
  }

  if (stored.revokedAt || stored.session.revokedAt) {
    return { status: "invalid" };
  }

  const absoluteExpiry = stored.session.expiresAt;
  if (absoluteExpiry && absoluteExpiry <= now) return { status: "invalid" };
  if (stored.expiresAt && stored.expiresAt <= now) return { status: "invalid" };

  const session = stored.session;
  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, username: true, name: true, email: true },
  });
  if (!user) return { status: "invalid" };

  const nextToken = createRefreshToken();
  const nextExpiresAt = absoluteExpiry ?? stored.expiresAt ?? null;

  try {
    const [, next] = await prisma.$transaction([
      // where с usedAt: null — защита от гонки: два параллельных refresh
      // не смогут оба пометить один токен использованным.
      prisma.refreshToken.update({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.refreshToken.create({
        data: {
          tokenHash: hashToken(nextToken),
          sessionId: session.id,
          userId: user.id,
          expiresAt: nextExpiresAt,
        },
      }),
      prisma.session.update({
        where: { id: session.id },
        data: {
          lastUsedAt: now,
          ip: metadata.ip ?? session.ip,
          userAgent: metadata.userAgent ?? session.userAgent,
          appVersion: metadata.appVersion ?? session.appVersion,
        },
      }),
    ]);

    return {
      status: "ok",
      auth: buildPayload(user, session.id, nextToken, next.expiresAt ?? null),
    };
  } catch (error) {
    // Ошибка обновления может значить две разные вещи, и путать их нельзя:
    //  - токен уже израсходован параллельным запросом → переиспользование;
    //  - сбой БД → это не повод разлогинивать пользователя.
    const consumed = await prisma.refreshToken.findUnique({
      where: { id: stored.id },
      select: { usedAt: true },
    });

    if (consumed?.usedAt) {
      await revokeSession(session.id, "refresh_token_reuse");
      return { status: "reuse", sessionId: session.id };
    }

    throw error;
  }
};

export const revokeSession = async (sessionId: string, reason: string) => {
  const now = new Date();
  const session = await prisma.session.findFirst({
    where: { id: sessionId, revokedAt: null },
    select: { id: true },
  });
  if (!session) return false;

  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: now, revokedReason: reason },
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId: session.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  return true;
};

/** Отзыв по конкретному refresh-токену (текущая сессия, `/auth/logout`). */
export const revokeSessionByRefreshToken = async (
  token: string,
  reason: string,
) => {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { sessionId: true, session: { select: { userId: true } } },
  });
  if (!stored || !stored.sessionId) return false;
  return revokeSession(stored.sessionId, reason);
};

/** Отзыв сессии с проверкой владельца (`/auth/sessions/:id`). */
export const revokeOwnedSession = async (
  sessionId: string,
  userId: string,
  reason: string,
) => {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId, revokedAt: null },
    select: { id: true },
  });
  if (!session) return false;
  return revokeSession(session.id, reason);
};

export interface SessionInfo {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  platform: string | null;
  appVersion: string | null;
  userAgent: string | null;
  ip: string | null;
  expiresAt: string | null;
  lastUsedAt: string;
  createdAt: string;
}

/** Активные (неотозванные и непросроченные) сессии пользователя. */
export const listSessions = async (userId: string): Promise<SessionInfo[]> => {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      deviceId: true,
      deviceName: true,
      platform: true,
      appVersion: true,
      userAgent: true,
      ip: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return sessions.map((session) => ({
    ...session,
    expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null,
    lastUsedAt: session.lastUsedAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  }));
};

/**
 * Сколько держать уже израсходованные refresh-токены.
 *
 * Их нельзя удалять сразу: именно по ним ловится переиспользование (reuse
 * detection). Но и вечно они не нужны — через месяц повтор токена всё равно
 * получит обычный `INVALID_REFRESH_TOKEN`, а не отзыв сессии.
 */
const USED_TOKEN_RETENTION_DAYS = 30;

/** Удаляет истёкшие сессии и мёртвые refresh-токены. */
export const cleanupExpired = async () => {
  const now = new Date();
  const usedCutoff = new Date(
    now.getTime() - USED_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const [tokens, sessions] = await prisma.$transaction([
    prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { revokedAt: { lt: now } },
          { usedAt: { lt: usedCutoff } },
        ],
      },
    }),
    prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: now } }],
        tokens: {
          none: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      },
    }),
  ]);

  return { tokens: tokens.count, sessions: sessions.count };
};
