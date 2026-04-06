import express from "express";

import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import {
  requestContextMiddleware,
  requestLoggingMiddleware
} from "./middlewares/request-context.middleware";
import {
  corsPolicy,
  loginBruteForceLimiter,
  preventHttpParamPollution,
  rateLimiter,
  sanitizeInput,
  secureHeaders
} from "./middlewares/security.middleware";
import routes from "./routes";

export const app = express();

app.set("trust proxy", 1);
app.use(secureHeaders);
app.use(corsPolicy);
app.use(rateLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(sanitizeInput);
app.use(preventHttpParamPollution);
app.use(requestContextMiddleware);
app.use(requestLoggingMiddleware);
app.use("/api/v1/auth/login", loginBruteForceLimiter);

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);
