import { Request, Response } from "express";
import { DeactivateUserParams, DeleteUserParams, ListUsersQuery } from "./admin.schema";
import { deactivateUserAccount, deleteUserAccount, listRegisteredUsers } from "./admin.service";

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

  const user = await deactivateUserAccount(params.userId, actorUserId);

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

  const user = await deleteUserAccount(params.userId, actorUserId);

  res.status(200).json({
    data: {
      user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}
