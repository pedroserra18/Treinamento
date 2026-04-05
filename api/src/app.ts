import express from "express";
import routes from "./routes";
import {
  corsPolicy,
  preventHttpParamPollution,
  rateLimiter,
  sanitizeInput,
  secureHeaders
} from "./middlewares/security.middleware";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";

export const app = express();

app.set("trust proxy", 1);
app.use(secureHeaders);
app.use(corsPolicy);
app.use(rateLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(sanitizeInput);
app.use(preventHttpParamPollution);

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);
