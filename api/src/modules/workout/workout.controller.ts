import { Request, Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import {
  addExerciseToPlan,
  createManualWorkoutHistory,
  createWorkoutPlan,
  deletePlanExercise,
  deleteWorkoutPlan,
  completeWorkoutSession,
  exploreWorkouts,
  fetchWorkoutRecommendations,
  getRecommendationTemplates,
  listWorkoutHistory,
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
  AddPlanExerciseBody,
  CreateManualHistoryBody,
  CreateWorkoutPlanBody,
  CompleteWorkoutBody,
  CompleteWorkoutParams,
  ExploreWorkoutsQuery,
  HistorySessionParams,
  ListWorkoutHistoryQuery,
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
