import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import {
  authCodeRequestLimiter,
  authCodeVerifyLimiter
} from "../../middlewares/security.middleware";
import {
  confirmEmailChangeBodySchema,
  deleteProfileBodySchema,
  forgotPasswordConfirmBodySchema,
  forgotPasswordRequestCodeBodySchema,
  googleCallbackQuerySchema,
  googleLinkBodySchema,
  loginBodySchema,
  onboardingCompleteBodySchema,
  refreshBodySchema,
  registerRequestCodeBodySchema,
  registerVerifyCodeBodySchema,
  registerBodySchema,
  requestEmailChangeBodySchema,
  updateHandleBodySchema,
  updateNameBodySchema,
  updateBirthDateBodySchema,
  updateGenderBodySchema
} from "./auth.schema";
import {
  confirmEmailChangeController,
  deleteAccountController,
  exportUserDataController,
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
  requestEmailChangeController,
  updateAvatarController,
  updateHandleController,
  updateNameController,
  getProfileDefaultsController,
  updateBirthDateController,
  updateGenderController,
  updatePrivacyController,
  registerRequestCodeController,
  registerVerifyCodeController,
  refreshController,
  registerController
} from "./auth.controller";

const router = Router();

router.post(
  "/auth/register",
  validateRequest({ body: registerBodySchema }),
  asyncHandler(async (req, res) => registerController(req, res))
);

router.post(
  "/auth/register/request-code",
  authCodeRequestLimiter,
  validateRequest({ body: registerRequestCodeBodySchema }),
  asyncHandler(async (req, res) => registerRequestCodeController(req, res))
);

router.post(
  "/auth/register/verify-code",
  authCodeVerifyLimiter,
  validateRequest({ body: registerVerifyCodeBodySchema }),
  asyncHandler(async (req, res) => registerVerifyCodeController(req, res))
);

router.post(
  "/auth/forgot-password/request-code",
  authCodeRequestLimiter,
  validateRequest({ body: forgotPasswordRequestCodeBodySchema }),
  asyncHandler(async (req, res) => forgotPasswordRequestCodeController(req, res))
);

router.post(
  "/auth/forgot-password/confirm",
  authCodeVerifyLimiter,
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

router.get("/auth/profile", requireAuth, asyncHandler(async (req, res) => profileController(req, res)))
router.patch("/auth/profile/avatar", requireAuth, asyncHandler(async (req, res) => updateAvatarController(req, res)));
router.patch("/auth/profile/privacy", requireAuth, asyncHandler(async (req, res) => updatePrivacyController(req, res)));
router.patch(
  "/auth/profile/handle",
  requireAuth,
  validateRequest({ body: updateHandleBodySchema }),
  asyncHandler(async (req, res) => updateHandleController(req, res))
);
router.patch(
  "/auth/profile/name",
  requireAuth,
  validateRequest({ body: updateNameBodySchema }),
  asyncHandler(async (req, res) => updateNameController(req, res))
);
router.get(
  "/auth/profile/defaults",
  requireAuth,
  asyncHandler(async (req, res) => getProfileDefaultsController(req, res))
);
router.patch(
  "/auth/profile/birthdate",
  requireAuth,
  validateRequest({ body: updateBirthDateBodySchema }),
  asyncHandler(async (req, res) => updateBirthDateController(req, res))
);
router.patch(
  "/auth/profile/gender",
  requireAuth,
  validateRequest({ body: updateGenderBodySchema }),
  asyncHandler(async (req, res) => updateGenderController(req, res))
);
router.post(
  "/auth/profile/email/request-code",
  requireAuth,
  authCodeRequestLimiter,
  validateRequest({ body: requestEmailChangeBodySchema }),
  asyncHandler(async (req, res) => requestEmailChangeController(req, res))
);
router.post(
  "/auth/profile/email/confirm",
  requireAuth,
  authCodeVerifyLimiter,
  validateRequest({ body: confirmEmailChangeBodySchema }),
  asyncHandler(async (req, res) => confirmEmailChangeController(req, res))
);
router.delete(
  "/auth/profile",
  requireAuth,
  validateRequest({ body: deleteProfileBodySchema }),
  asyncHandler(async (req, res) => deleteAccountController(req, res))
);
router.get(
  "/auth/profile/export",
  requireAuth,
  asyncHandler(async (req, res) => exportUserDataController(req, res))
);
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
