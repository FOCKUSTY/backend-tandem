import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";
import { env } from "../env.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
  }),
  transactionOptions: {
    maxWait: 10_000,
    timeout: 15_000,
  }
});

export default prisma;
