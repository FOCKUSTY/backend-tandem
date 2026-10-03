import nodemailer from "nodemailer";
import { env } from "../env.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: parseInt(env.SMTP_PORT, 10),
  secure: parseInt(env.SMTP_PORT, 10) === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
): Promise<void> {
  const from = env.SMTP_FROM;
  const subject = "Сброс пароля";
  const text = `Для сброса пароля перейдите по ссылке: ${resetLink}`;
  const html = `
<p>Для сброса пароля перейдите по <a href="${resetLink}">ссылке</a>.</p>
`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}
