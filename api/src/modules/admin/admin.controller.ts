import { Request, Response } from "express";
import {
  DeactivateUserParams,
  DeleteUserParams,
  ListUsersQuery,
  ReactivateUserParams,
  UpdatePlanBody,
  UpdatePlanParams,
  UpdateRoleBody,
  UpdateRoleParams,
  UserDetailParams
} from "./admin.schema";
import {
  deactivateUserAccount,
  deleteUserAccount,
  getUserDetail,
  listRegisteredUsers,
  reactivateUserAccount,
  updateUserPlan,
  updateUserRole
} from "./admin.service";
import { eventContextFromRequest } from "../../shared/utils/event-context";

export async function listUsersController(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListUsersQuery;
  const data = await listRegisteredUsers(query);

  res.status(200).json({
    data,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function deactivateUserController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as DeactivateUserParams;
  const actorUserId = req.context.userId as string;

  const user = await deactivateUserAccount(params.userId, actorUserId, eventContextFromRequest(req));

  res.status(200).json({
    data: {
      user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function deleteUserController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as DeleteUserParams;
  const actorUserId = req.context.userId as string;

  const user = await deleteUserAccount(params.userId, actorUserId, eventContextFromRequest(req));

  res.status(200).json({
    data: {
      user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function reactivateUserController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as ReactivateUserParams;
  const actorUserId = req.context.userId as string;

  const user = await reactivateUserAccount(params.userId, actorUserId, eventContextFromRequest(req));

  res.status(200).json({
    data: {
      user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function userDetailController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as UserDetailParams;
  const detail = await getUserDetail(params.userId);

  res.status(200).json({
    data: detail,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function updateUserRoleController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as UpdateRoleParams;
  const body = req.body as UpdateRoleBody;
  const actorUserId = req.context.userId as string;

  const user = await updateUserRole(params.userId, actorUserId, body.role, eventContextFromRequest(req));

  res.status(200).json({
    data: {
      user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function updateUserPlanController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as UpdatePlanParams;
  const body = req.body as UpdatePlanBody;
  const actorUserId = req.context.userId as string;

  // expiresAt undefined no body = não muda; null = limpa expiração; string = define.
  // Como o schema só aceita {plan, expiresAt?}, normalizamos pra Date|null aqui
  // pra deixar o service simples.
  const expiresAtRaw = "expiresAt" in body ? body.expiresAt : undefined;
  const expiresAt = expiresAtRaw == null ? null : new Date(expiresAtRaw);

  const user = await updateUserPlan(params.userId, actorUserId, body.plan, expiresAt, eventContextFromRequest(req));

  res.status(200).json({
    data: { user },
    meta: { requestId: req.context.requestId }
  });
}
