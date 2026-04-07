import { Router } from "express";

import {
  forgotPasswordConfirmController,
  forgotPasswordRequestCodeController,
  googleCallbackController,
  googleLinkController,
  googleLinkStartController,
  googleStartController,
  loginController,
  logoutController,
  onboardingCompleteController,
  onboardingStatusController,
  profileController,
  registerRequestCodeController,
  registerVerifyCodeController,
  refreshController,
  registerController
} from "./auth.controller";
import {
  forgotPasswordConfirmBodySchema,
  forgotPasswordRequestCodeBodySchema,
  googleCallbackQuerySchema,
  googleLinkBodySchema,
  loginBodySchema,
  onboardingCompleteBodySchema,
  refreshBodySchema,
  registerRequestCodeBodySchema,
  registerVerifyCodeBodySchema,
  registerBodySchema
} from "./auth.schema";
import { requireAuth } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";

const router = Router();

router.post(
  "/auth/register",
  validateRequest({ body: registerBodySchema }),
  asyncHandler(async (req, res) => registerController(req, res))
);

router.post(
  "/auth/register/request-code",
  validateRequest({ body: registerRequestCodeBodySchema }),
  asyncHandler(async (req, res) => registerRequestCodeController(req, res))
);

router.post(
  "/auth/register/verify-code",
  validateRequest({ body: registerVerifyCodeBodySchema }),
  asyncHandler(async (req, res) => registerVerifyCodeController(req, res))
);

router.post(
  "/auth/forgot-password/request-code",
  validateRequest({ body: forgotPasswordRequestCodeBodySchema }),
  asyncHandler(async (req, res) => forgotPasswordRequestCodeController(req, res))
);

router.post(
  "/auth/forgot-password/confirm",
  validateRequest({ body: forgotPasswordConfirmBodySchema }),
  asyncHandler(async (req, res) => forgotPasswordConfirmController(req, res))
);

router.get("/auth/google/start", asyncHandler(async (req, res) => googleStartController(req, res)));
router.get(
  "/auth/google/callback",
  validateRequest({ query: googleCallbackQuerySchema }),
  asyncHandler(async (req, res) => googleCallbackController(req, res))
);
router.get(
  "/auth/google/link/start",
  requireAuth,
  asyncHandler(async (req, res) => googleLinkStartController(req, res))
);
router.post(
  "/auth/google/link",
  requireAuth,
  validateRequest({ body: googleLinkBodySchema }),
  asyncHandler(async (req, res) => googleLinkController(req, res))
);

router.post(
  "/auth/login",
  validateRequest({ body: loginBodySchema }),
  asyncHandler(async (req, res) => loginController(req, res))
);

router.post(
  "/auth/refresh",
  validateRequest({ body: refreshBodySchema }),
  asyncHandler(async (req, res) => refreshController(req, res))
);

router.post("/auth/logout", requireAuth, asyncHandler(async (req, res) => logoutController(req, res)));

router.get("/auth/profile", requireAuth, asyncHandler(async (req, res) => profileController(req, res)));
router.get(
  "/auth/onboarding/status",
  requireAuth,
  asyncHandler(async (req, res) => onboardingStatusController(req, res))
);
router.post(
  "/auth/onboarding/complete",
  requireAuth,
  validateRequest({ body: onboardingCompleteBodySchema }),
  asyncHandler(async (req, res) => onboardingCompleteController(req, res))
);

export default router;
