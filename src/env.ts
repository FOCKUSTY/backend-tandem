import { Env } from "fenviee";
import process from "process";

export const env = Env.create(process.env)({
  required: [
    "DATABASE_URL",
    "JWT_SECRET",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ],
  partial: [],
  default: {},
  unique: {},
});
