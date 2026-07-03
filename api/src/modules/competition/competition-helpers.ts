import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";

// Helpers compartilhados entre competition.service e os serviços extraídos
// (chat, etc.). Ficam aqui para evitar import circular com o barrel.

// Rate limit de mensagens/comentários (1 por N segundos por usuário). Usado
// pelo chat (competition-chat.service) e pelos comentários (competition.service).
export const CHAT_RATE_LIMIT_SEC = 2;

export async function assertActiveMembership(userId: string, competitionId: string): Promise<void> {
  const m = await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    select: { abandonedAt: true }
  });
  if (!m) {
    throw new AppError("Você não faz parte dessa competição", { statusCode: 403, code: "COMPETITION_NOT_A_MEMBER" });
  }
  if (m.abandonedAt) {
    throw new AppError("Você abandonou essa competição", { statusCode: 403, code: "COMPETITION_ABANDONED" });
  }
}

// Garante que a prova (entry) pertence à competição informada. Usado pelas
// reações (competition.service) e pelos comentários (competition-comments).
export async function assertEntryInCompetition(competitionId: string, entryId: string): Promise<void> {
  const entry = await prisma.competitionEntry.findUnique({
    where: { id: entryId },
    select: { competitionId: true }
  });
  if (!entry || entry.competitionId !== competitionId) {
    throw new AppError("Prova não encontrada", { statusCode: 404, code: "COMPETITION_ENTRY_NOT_FOUND" });
  }
}
