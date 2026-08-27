import { Env } from "fenviee";
import process from "process";

export const env = Env.create(process.env)({
  required: ["DATABASE_URL", "JWT_SECRET"],
  partial: [],
  default: {},
  unique: {},
});
