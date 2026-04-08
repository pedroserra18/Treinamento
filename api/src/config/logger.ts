import { createLogger, format, transports } from "winston";

const isProd = process.env.NODE_ENV === "production";

const normalizeErrorMeta = format((info) => {
  const errorKeys: Array<"err" | "error"> = ["err", "error"];

  for (const key of errorKeys) {
    const value = info[key];
    if (value instanceof Error) {
      info[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
  }

  return info;
});

const eventShape = format((info) => {
  const { timestamp, level, message, ...meta } = info;
  const eventName = typeof message === "string" ? message : "log";

  return {
    timestamp,
    level,
    message: eventName,
    event: eventName,
    ...meta
  };
});

export const logger = createLogger({
  level: isProd ? "info" : "debug",
  defaultMeta: {
    service: "acad-api",
    environment: process.env.NODE_ENV ?? "development"
  },
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    normalizeErrorMeta(),
    eventShape(),
    format.json()
  ),
  transports: [new transports.Console()]
});
