import { logger } from "../../config/logger";
import { isPushConfigured, processDuePendingNotifications, pruneOldScheduledNotifications } from "./push.service";

// Worker in-process pra processar agendamentos de push. Roda no MESMO
// processo do API (não em um separado) porque:
//   • Render free tier não suporta múltiplos services baratos.
//   • Volume é baixo (1 push por descanso, ~10/treino, ~5 treinos/dia/user).
//   • Janela de erro aceitável é segundos, não milissegundos.
//
// Intervalo de 1s pra precisão razoável no descanso. processDuePending
// usa LIMIT 50 e operações idempotentes (mesmo se tick atrasar, próximo
// tick limpa o backlog sem duplicar). Prune roda a cada 6h pra impedir
// crescimento descontrolado da tabela.
//
// IMPORTANTE: o processo do Render free tier dorme após 15min idle. Se
// o user agenda um push pra daqui a 17min e ninguém pinga a API entre
// minuto 15 e 17, o setInterval para junto com o processo e o push só
// dispara quando alguém acordar a API. Mitigação:
//   • cron-job.org pingando /api/v1/health ou um endpoint dedicado a
//     cada minuto pra manter quente (já é prática do projeto).
//   • Endpoint /api/v1/cron/process-push como safety net — qualquer
//     poll externo pode forçar o processamento mesmo no boot.
//
// Para chamar o processamento no boot (depois de cold start), também
// chamamos processDuePendingNotifications uma vez em start().

let timer: NodeJS.Timeout | null = null;
let pruneTimer: NodeJS.Timeout | null = null;
let running = false;

const TICK_MS = 1000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

export function startPushWorker(): void {
  if (timer || pruneTimer) {
    return; // já rodando
  }
  if (!isPushConfigured()) {
    logger.warn("[push.worker] não iniciado — VAPID ausente.");
    return;
  }

  // Tick principal — protege contra reentrada (running flag) pra o caso
  // de uma execução demorar mais que TICK_MS por causa de DB lento.
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await processDuePendingNotifications();
      if (result.sent > 0 || result.failed > 0) {
        logger.info(
          `[push.worker] tick: sent=${result.sent} failed=${result.failed} cancelled=${result.cancelled}`
        );
      }
    } catch (err) {
      logger.error("[push.worker] tick falhou:", err);
    } finally {
      running = false;
    }
  };

  // Roda imediatamente pra cobrir jobs que vencerem durante cold start,
  // depois entra no intervalo regular.
  void tick();
  timer = setInterval(tick, TICK_MS);

  // Prune separado, frequência baixa.
  const prune = async (): Promise<void> => {
    try {
      const deleted = await pruneOldScheduledNotifications();
      if (deleted > 0) {
        logger.info(`[push.worker] prune: removidos ${deleted} jobs antigos.`);
      }
    } catch (err) {
      logger.error("[push.worker] prune falhou:", err);
    }
  };
  pruneTimer = setInterval(prune, PRUNE_INTERVAL_MS);

  logger.info(`[push.worker] iniciado (tick=${TICK_MS}ms, prune=${PRUNE_INTERVAL_MS}ms).`);
}

export function stopPushWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
  running = false;
  logger.info("[push.worker] parado.");
}
