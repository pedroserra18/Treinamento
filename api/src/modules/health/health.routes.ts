import { Router } from "express";

const router = Router();

// Health check rico — usado por dashboards, monitoramento externo e
// debug manual. Inclui timestamp pra confirmar que não é resposta cached.
router.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "acad-api", timestamp: new Date().toISOString() });
});

// Endpoint ultra-leve dedicado pra keep-alive externo (cron-job.org,
// UptimeRobot etc). Render free tier dorme após 15 min sem requisição
// → primeira request demora 30-60s pra acordar. Um cron externo pingando
// /ping a cada 14 min mantém o processo quente. Retorna texto plano
// (sem JSON serialize, sem timestamp, sem alocação extra) pra minimizar
// custo. Tudo que o cron precisa é o 200 OK.
router.get("/ping", (_req, res) => {
  res.status(200).type("text/plain").send("pong");
});

export default router;
