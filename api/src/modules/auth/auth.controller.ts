import { Request, Response } from "express";

import {
  ForgotPasswordConfirmBody,
  ForgotPasswordRequestCodeBody,
  GoogleCallbackQuery,
  GoogleLinkBody,
  LoginBody,
  OnboardingCompleteBody,
  RefreshBody,
  RegisterBody
} from "./auth.schema";
import { RegisterRequestCodeBody, RegisterVerifyCodeBody } from "./auth.schema";
import {
  completeOnboarding,
  getAuthenticatedProfile,
  getOnboardingStatus,
  loginWithEmail,
  logoutSession,
  refreshSession,
  registerWithEmail
} from "./auth.service";
import {
  confirmForgotPasswordWithCode,
  requestForgotPasswordCode
} from "./password-recovery.service";
import { requestRegisterEmailCode, verifyRegisterEmailCode } from "./registration-verification.service";
import {
  buildGoogleAuthorizationUrl,
  linkGoogleToAuthenticatedUser,
  loginWithGoogleCode
} from "./google-oauth.service";
import { consumeOAuthState, createOAuthState } from "./oauth-state.service";
import { logger } from "../../config/logger";
import { trackLoginFailure } from "../../middlewares/security.middleware";
import { AppError } from "../../shared/errors/app-error";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "invalid";
  }

  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export async function registerController(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterBody;
  const result = await registerWithEmail(body);

  res.status(201).json({
    data: {
      token: result.tokens.token,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: result.user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function registerRequestCodeController(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterRequestCodeBody;

  const result = await requestRegisterEmailCode(body.email);

  res.status(200).json({
    data: {
      success: true,
      message: "Verification code sent",
      delivery: result.delivery
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function registerVerifyCodeController(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterVerifyCodeBody;

  await verifyRegisterEmailCode(body.email, body.verificationCode);

  const result = await registerWithEmail({
    name: body.name,
    email: body.email,
    password: body.password
  });

  res.status(201).json({
    data: {
      token: result.tokens.token,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: result.user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function forgotPasswordRequestCodeController(req: Request, res: Response): Promise<void> {
  const body = req.body as ForgotPasswordRequestCodeBody;

  await requestForgotPasswordCode(body.email);

  res.status(200).json({
    data: {
      success: true,
      message: "If the email exists, a recovery code has been sent"
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function forgotPasswordConfirmController(req: Request, res: Response): Promise<void> {
  const body = req.body as ForgotPasswordConfirmBody;

  await confirmForgotPasswordWithCode(body.email, body.verificationCode, body.newPassword);

  res.status(200).json({
    data: {
      success: true,
      message: "Password reset completed"
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginBody;

  try {
    const result = await loginWithEmail(body);

    logger.info("auth_login_success", {
      requestId: req.context.requestId,
      userId: result.user.id,
      provider: "EMAIL_PASSWORD",
      emailMasked: maskEmail(result.user.email),
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.status(200).json({
      data: {
        token: result.tokens.token,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        user: result.user
      },
      meta: {
        requestId: req.context.requestId
      }
    });
  } catch (error) {
    trackLoginFailure(body.email, req.ip ?? "unknown", {
      requestId: req.context.requestId,
      userAgent: req.get("user-agent"),
      path: req.originalUrl
    });
    throw error;
  }
}

export async function refreshController(req: Request, res: Response): Promise<void> {
  const body = req.body as RefreshBody;
  const tokens = await refreshSession(body);

  res.status(200).json({
    data: {
      token: tokens.token,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  await logoutSession(req.context.userId as string);

  res.status(200).json({
    data: {
      success: true
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function googleStartController(req: Request, res: Response): Promise<void> {
  const state = await createOAuthState({ mode: "login" });
  const authorizationUrl = await buildGoogleAuthorizationUrl(state);

  res.status(200).json({
    data: {
      authorizationUrl,
      state
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function googleCallbackController(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as GoogleCallbackQuery;
  const oauthState = await consumeOAuthState(query.state);

  if (!oauthState || oauthState.mode !== "login") {
    throw new AppError("Invalid or expired OAuth state", {
      statusCode: 400,
      code: "INVALID_OAUTH_STATE"
    });
  }

  const result = await loginWithGoogleCode(query.code);

  logger.info("auth_login_success", {
    requestId: req.context.requestId,
    userId: result.user.id,
    provider: "GOOGLE",
    emailMasked: maskEmail(result.user.email),
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  });

  res.status(200).json({
    data: {
      token: result.tokens.token,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: result.user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function googleLinkStartController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const state = await createOAuthState({ mode: "link", userId });
  const authorizationUrl = await buildGoogleAuthorizationUrl(state);

  res.status(200).json({
    data: {
      authorizationUrl,
      state
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function googleLinkController(req: Request, res: Response): Promise<void> {
  const body = req.body as GoogleLinkBody;
  const userId = req.context.userId as string;

  const oauthState = await consumeOAuthState(body.state);
  if (!oauthState || oauthState.mode !== "link" || oauthState.userId !== userId) {
    throw new AppError("Invalid or expired OAuth link state", {
      statusCode: 400,
      code: "INVALID_OAUTH_STATE"
    });
  }

  const result = await linkGoogleToAuthenticatedUser(userId, body.code);
  res.status(200).json({
    data: {
      token: result.tokens.token,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: result.user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function profileController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const user = await getAuthenticatedProfile(userId);

  res.status(200).json({
    data: user,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function onboardingStatusController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const status = await getOnboardingStatus(userId);

  res.status(200).json({
    data: status,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function onboardingCompleteController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const body = req.body as OnboardingCompleteBody;
  const user = await completeOnboarding(userId, body);

  res.status(200).json({
    data: {
      user
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}
