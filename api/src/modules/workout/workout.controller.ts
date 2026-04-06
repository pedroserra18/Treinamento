import { Request, Response } from "express";

import {
  CompleteWorkoutBody,
  CompleteWorkoutParams,
  ExploreWorkoutsQuery,
  ListWorkoutHistoryQuery,
  StartWorkoutBody
} from "./workout.schema";
import {
  completeWorkoutSession,
  exploreWorkouts,
  fetchWorkoutRecommendations,
  listWorkoutHistory,
  startWorkoutSession
} from "./workout.service";
import { AppError } from "../../shared/errors/app-error";

function eventContextFromRequest(req: Request): {
  requestId: string;
  ipAddress: string;
  userAgent?: string;
} {
  return {
    requestId: req.context.requestId,
    ipAddress: req.ip ?? "unknown",
    userAgent: req.header("user-agent") ?? undefined
  };
}

export async function getWorkoutRecommendationsController(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.context.userId as string;
  const data = await fetchWorkoutRecommendations(userId, eventContextFromRequest(req));

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function startWorkoutController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as StartWorkoutBody;

  const session = await startWorkoutSession(userId, payload, eventContextFromRequest(req));

  res.status(201).json({
    data: session,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function completeWorkoutController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompleteWorkoutParams;
  const payload = req.body as CompleteWorkoutBody;

  const completed = await completeWorkoutSession(
    userId,
    params,
    payload,
    eventContextFromRequest(req)
  );

  res.status(200).json({
    data: completed,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function listWorkoutHistoryController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const query = req.query as unknown as ListWorkoutHistoryQuery;

  const history = await listWorkoutHistory(userId, query);

  res.status(200).json({
    data: history,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function exploreWorkoutsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const query = req.query as unknown as ExploreWorkoutsQuery;

  try {
    const result = await exploreWorkouts(userId, query);

    res.status(200).json({
      data: result,
      meta: {
        requestId: req.context.requestId
      }
    });
  } catch (error) {
    throw new AppError("Failed to explore workouts endpoint", {
      statusCode: 500,
      code: "WORKOUT_EXPLORE_CONTROLLER_FAILED",
      details: error instanceof Error ? error.message : "unknown_error"
    });
  }
}
