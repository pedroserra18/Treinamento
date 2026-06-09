import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdminRole } from "../../middlewares/role.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  createProInviteBodySchema,
  proInviteIdParamsSchema,
  proInviteTokenParamsSchema
} from "./subscription.schema";
import {
  createProInviteController,
  getPlanSummaryController,
  listProInvitesController,
  previewProInviteController,
  redeemProInviteController,
  revokeProInviteController
} from "./subscription.controller";

const router = Router();

// ─── Plan summary ────────────────────────────────────────────────────
// Usado pela tela "Settings → Plano" pra mostrar tier + uso + limites.
router.get(
  "/subscription/plan",
  requireAuth,
  asyncHandler(async (req, res) => getPlanSummaryController(req, res))
);

// ─── Admin: gerenciar convites PRO ────────────────────────────────────
router.get(
  "/admin/pro-invites",
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => listProInvitesController(req, res))
);

router.post(
  "/admin/pro-invites",
  requireAuth,
  requireAdminRole,
  validateRequest({ body: createProInviteBodySchema }),
  asyncHandler(async (req, res) => createProInviteController(req, res))
);

router.delete(
  "/admin/pro-invites/:inviteId",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: proInviteIdParamsSchema }),
  asyncHandler(async (req, res) => revokeProInviteController(req, res))
);

// ─── Public: resgatar convite ──────────────────────────────────────────
// Preview NÃO precisa auth — token já é segredo. Permite a página pública
// mostrar "Convite válido de Pedro" antes do user logar/cadastrar.
router.get(
  "/pro-invites/:token",
  validateRequest({ params: proInviteTokenParamsSchema }),
  asyncHandler(async (req, res) => previewProInviteController(req, res))
);

// Redeem PRECISA auth — só user logado pode trocar plano. Frontend
// redireciona pra register/login se não logado e re-redime depois.
router.post(
  "/pro-invites/:token/redeem",
  requireAuth,
  validateRequest({ params: proInviteTokenParamsSchema }),
  asyncHandler(async (req, res) => redeemProInviteController(req, res))
);

export default router;
