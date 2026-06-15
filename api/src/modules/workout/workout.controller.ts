import { Request, Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import {
  addExerciseToPlan,
  addExercisesToPlanBatch,
  addPlanCardio,
  createManualWorkoutHistory,
  createWorkoutPlan,
  createWorkoutPlanWithExercises,
  deletePlanCardio,
  deletePlanExercise,
  deletePlanExercisesBatch,
  deleteWorkoutPlan,
  completeWorkoutSession,
  exploreWorkouts,
  fetchWorkoutRecommendations,
  getRecommendationTemplates,
  getWorkoutSessionById,
  getSessionHighlights,
  listExercisePersonalRecords,
  listWorkoutHistory,
  listLatestExerciseHistory,
  listRecentAIGenerations,
  listUserWorkoutPlans,
  reorderPlanExercises,
  searchExercisesForPlan,
  startWorkoutSession
  ,
  updateWorkoutPlan,
  updateCompletedWorkoutDuration,
  updatePlanExercise
} from "./workout.service";
import {
  AddPlanCardioBody,
  AddPlanExerciseBody,
  AddPlanExercisesBatchBody,
  CreateManualHistoryBody,
  CreateWorkoutPlanBody,
  CreateWorkoutPlanWithExercisesBody,
  CompleteWorkoutBody,
  CompleteWorkoutParams,
  DeletePlanExercisesBatchBody,
  ExploreWorkoutsQuery,
  HistorySessionParams,
  LatestExerciseHistoryBody,
  ListWorkoutHistoryQuery,
  PersonalRecordsBody,
  PlanCardioParams,
  PlanExerciseParams,
  RecommendationTemplateQuery,
  ReorderPlanExercisesBody,
  SearchExercisesQuery,
  StartWorkoutBody
  ,
  UpdateWorkoutPlanBody,
  UpdatePlanExerciseBody,
  UpdateWorkoutDurationBody,
  WorkoutPlanParams
} from "./workout.schema";

import { eventContextFromRequest } from "../../shared/utils/event-context";

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

export async function listWorkoutPlansController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const plans = await listUserWorkoutPlans(userId);

  res.status(200).json({
    data: plans,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function listRecentAIGenerationsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  // Limit clampado em 1..10 — UI hoje pede 3 mas deixamos config via query.
  const rawLimit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 3;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(10, rawLimit)) : 3;
  const generations = await listRecentAIGenerations(userId, limit);

  res.status(200).json({
    data: generations,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function createWorkoutPlanController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as CreateWorkoutPlanBody;
  const plan = await createWorkoutPlan(userId, payload);

  res.status(201).json({
    data: plan,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function createWorkoutPlanWithExercisesController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as CreateWorkoutPlanWithExercisesBody;
  const plan = await createWorkoutPlanWithExercises(userId, payload);

  res.status(201).json({
    data: plan,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function deleteWorkoutPlanController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as WorkoutPlanParams;
  const data = await deleteWorkoutPlan(userId, params);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function updateWorkoutPlanController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as WorkoutPlanParams;
  const payload = req.body as UpdateWorkoutPlanBody;
  const plan = await updateWorkoutPlan(userId, params, payload);

  res.status(200).json({
    data: plan,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function addPlanExerciseController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as WorkoutPlanParams;
  const payload = req.body as AddPlanExerciseBody;
  const item = await addExerciseToPlan(userId, params, payload);

  res.status(201).json({
    data: item,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function updatePlanExerciseController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as PlanExerciseParams;
  const payload = req.body as UpdatePlanExerciseBody;
  const item = await updatePlanExercise(userId, params, payload);

  res.status(200).json({
    data: item,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function deletePlanExerciseController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as PlanExerciseParams;
  const data = await deletePlanExercise(userId, params);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function addPlanExercisesBatchController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as WorkoutPlanParams;
  const payload = req.body as AddPlanExercisesBatchBody;
  const items = await addExercisesToPlanBatch(userId, params, payload);

  res.status(201).json({
    data: items,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function deletePlanExercisesBatchController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as WorkoutPlanParams;
  const payload = req.body as DeletePlanExercisesBatchBody;
  const data = await deletePlanExercisesBatch(userId, params, payload);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function addPlanCardioController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as WorkoutPlanParams;
  const body = req.body as AddPlanCardioBody;
  const data = await addPlanCardio(userId, params, body);
  res.status(201).json({ data, meta: { requestId: req.context.requestId } });
}

export async function deletePlanCardioController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as PlanCardioParams;
  const data = await deletePlanCardio(userId, params);
  res.status(200).json({ data, meta: { requestId: req.context.requestId } });
}

export async function reorderPlanExercisesController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as WorkoutPlanParams;
  const payload = req.body as ReorderPlanExercisesBody;
  const plan = await reorderPlanExercises(userId, params, payload);

  res.status(200).json({
    data: plan,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function searchExercisesController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const query = req.query as unknown as SearchExercisesQuery;
  const items = await searchExercisesForPlan(userId, query);

  res.status(200).json({
    data: items,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function recommendationTemplatesController(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as RecommendationTemplateQuery;
  const data = getRecommendationTemplates(query);

  res.status(200).json({
    data,
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

export async function getWorkoutSessionController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as HistorySessionParams;
  const session = await getWorkoutSessionById(userId, params.sessionId);

  res.status(200).json({
    data: session,
    meta: { requestId: req.context.requestId }
  });
}

export async function getSessionHighlightsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as HistorySessionParams;
  const data = await getSessionHighlights(userId, params);

  res.status(200).json({
    data,
    meta: { requestId: req.context.requestId }
  });
}

export async function personalRecordsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as PersonalRecordsBody;
  const data = await listExercisePersonalRecords(userId, payload.exerciseIds);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function latestExerciseHistoryController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as LatestExerciseHistoryBody;
  const data = await listLatestExerciseHistory(userId, payload.exerciseIds);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function updateWorkoutHistoryDurationController(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as HistorySessionParams;
  const payload = req.body as UpdateWorkoutDurationBody;
  const data = await updateCompletedWorkoutDuration(userId, params, payload);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function createManualHistoryController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as CreateManualHistoryBody;
  const data = await createManualWorkoutHistory(userId, payload);

  res.status(201).json({
    data,
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
