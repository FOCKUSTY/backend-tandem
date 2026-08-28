FROM oven/bun:latest AS builder

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

COPY . .

ENV DATABASE_URL="postgres://"

RUN bunx prisma generate

FROM oven/bun:latest

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/tsconfig.json ./

COPY --from=builder /app/src/prisma ./src/prisma

ENV NODE_ENV=production

CMD ["sh", "-c", "bunx prisma migrate deploy && bun run src/index.ts"]
