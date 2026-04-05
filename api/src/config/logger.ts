import { createLogger, format, transports } from "winston";

const isProd = process.env.NODE_ENV === "production";

export const logger = createLogger({
  level: isProd ? "info" : "debug",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [new transports.Console()]
});
