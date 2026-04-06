import nodemailer from "nodemailer";

import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AppError } from "../errors/app-error";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: nodemailer.Transporter | null = null;

export function isEmailServiceConfigured(): boolean {
  return Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPass && env.smtpFrom);
}

function getTransporter(): nodemailer.Transporter {
  if (transporter) {
    return transporter;
  }

  if (!isEmailServiceConfigured()) {
    throw new AppError("Email service not configured", {
      statusCode: 503,
      code: "EMAIL_SERVICE_NOT_CONFIGURED"
    });
  }

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass
    }
  });

  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const mailTransporter = getTransporter();

  await mailTransporter.sendMail({
    from: env.smtpFrom,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });

  logger.info("email_sent", {
    to: input.to,
    subject: input.subject
  });
}
