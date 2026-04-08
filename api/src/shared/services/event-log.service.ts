import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import { EventCategory, EventSeverity, Prisma } from "@prisma/client";

type TrackEventInput = {
  userId?: string;
  category: EventCategory;
  severity?: EventSeverity;
  action: string;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  message?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function trackEvent(input: TrackEventInput): Promise<void> {
  try {
    await prisma.eventLog.create({
      data: {
        userId: input.userId,
        category: input.category,
        severity: input.severity ?? "INFO",
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        message: input.message,
        metadata: input.metadata
      }
    });
  } catch (error) {
    logger.warn("event_log_persist_failed", {
      action: input.action,
      category: input.category,
      requestId: input.requestId,
      err: error
    });
  }
}
