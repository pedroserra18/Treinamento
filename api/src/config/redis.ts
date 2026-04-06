import Redis from "ioredis";

import { env } from "./env";
import { logger } from "./logger";

let redisClient: Redis | null = null;

if (env.redisUrl) {
  redisClient = new Redis(env.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true
  });

  redisClient.on("error", (error) => {
    logger.error("redis_error", {
      message: error.message
    });
  });

  redisClient.on("connect", () => {
    logger.info("redis_connected");
  });

  void redisClient.connect().catch((error) => {
    logger.warn("redis_connect_failed", {
      message: error.message
    });
  });
}

export { redisClient };
