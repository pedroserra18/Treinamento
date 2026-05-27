import { Request, Response } from "express";
import {
  removeBodyMeasurement,
  addPinnedExercise,
  createBodyMeasurement,
  listBodyMeasurements,
  listExerciseProgress,
  listPinnedExercises,
  removePinnedExercise,
  reorderPinnedExercises
} from "./progress.service";
import {
  BodyMeasurementParams,
  CreateBodyMeasurementBody,
  ExerciseParams,
  ListBodyMeasurementsQuery,
  PinnedExerciseBody,
  ReorderPinnedExercisesBody
} from "./progress.schema";

export async function listPinnedExercisesController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const data = await listPinnedExercises(userId);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function addPinnedExerciseController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as PinnedExerciseBody;
  const data = await addPinnedExercise(userId, payload);

  res.status(201).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function reorderPinnedExercisesController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as ReorderPinnedExercisesBody;
  const data = await reorderPinnedExercises(userId, payload);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function removePinnedExerciseController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as ExerciseParams;
  const data = await removePinnedExercise(userId, params);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function listExerciseProgressController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const data = await listExerciseProgress(userId);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function createBodyMeasurementController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const payload = req.body as CreateBodyMeasurementBody;
  const data = await createBodyMeasurement(userId, payload);

  res.status(201).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function listBodyMeasurementsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const query = req.query as unknown as ListBodyMeasurementsQuery;
  const data = await listBodyMeasurements(userId, query);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function removeBodyMeasurementController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as BodyMeasurementParams;
  const data = await removeBodyMeasurement(userId, params);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}
