import { Resend } from "resend";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AppError } from "../errors/app-error";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let resendClient: Resend | null = null;

export function isEmailServiceConfigured(): boolean {
  return Boolean(env.resendApiKey && env.resendFromEmail);
}

function getResendClient(): Resend {
  if (resendClient) {
    return resendClient;
  }

  if (!isEmailServiceConfigured()) {
    throw new AppError("Email service not configured", {
      statusCode: 503,
      code: "EMAIL_SERVICE_NOT_CONFIGURED"
    });
  }

  resendClient = new Resend(env.resendApiKey);

  return resendClient;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from: env.resendFromEmail as string,
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: input.html
  });

  if (error) {
    throw new AppError(`Resend delivery failed: ${error.message}`, {
      statusCode: 502,
      code: "EMAIL_DELIVERY_FAILED"
    });
  }

  logger.info("email_sent", {
    to: input.to,
    subject: input.subject
  });
}
