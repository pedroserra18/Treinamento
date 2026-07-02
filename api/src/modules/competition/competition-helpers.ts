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
