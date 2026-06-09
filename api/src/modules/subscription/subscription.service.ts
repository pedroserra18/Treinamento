import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { PlanSummary, getPlanSummary } from "../../shared/plan-limits";

// Re-exporta getPlanSummary com a assinatura do módulo pra controllers
// importarem só daqui. Mantém a função no lib/plan-limits onde ela tem
// proximidade com a config de limites.
export { getPlanSummary };
export type { PlanSummary };

// ─── Pro upgrade invites ────────────────────────────────────────────────
//
// Tudo o que envolve criar/listar/revogar/redimir convites de upgrade pra
// PRO. Admin endpoints ficam em /admin/pro-invites (Phase 2), redeem
// público fica em /pro-invites/:token/redeem.

export type CreateProInviteInput = {
  expiresInDays?: number; // opcional — null = não expira
  note?: string;
};

export type ProInviteSummary = {
  id: string;
  token: string;
  note: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  usedByName: string | null;
  revokedAt: string | null;
  createdAt: string;
  // URL completa pronta pra copiar — backend monta com CLIENT_URL.
  shareUrl: string;
};

export async function createProInvite(
  adminUserId: string,
  input: CreateProInviteInput,
  clientUrl: string
): Promise<ProInviteSummary> {
  // Rate-limit informal: usa o middleware global. Aqui só checa quota
  // simples (50 criados nas últimas 24h) pra prevenir abuse caso o
  // middleware falhe.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await prisma.proUpgradeInvite.count({
    where: { createdById: adminUserId, createdAt: { gt: oneDayAgo } }
  });
  if (recentCount >= 50) {
    throw new AppError(
      "Limite de 50 convites criados em 24h atingido.",
      { statusCode: 429, code: "PRO_INVITE_RATE_LIMIT" }
    );
  }

  const expiresAt =
    input.expiresInDays != null
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const created = await prisma.proUpgradeInvite.create({
    data: {
      createdById: adminUserId,
      note: input.note?.trim() || null,
      expiresAt
    },
    select: {
      id: true,
      token: true,
      note: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      createdAt: true,
      usedBy: { select: { name: true } }
    }
  });

  return toInviteSummary(created, clientUrl);
}

export async function listProInvites(
  adminUserId: string,
  clientUrl: string,
  limit = 50
): Promise<ProInviteSummary[]> {
  const rows = await prisma.proUpgradeInvite.findMany({
    where: { createdById: adminUserId },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, limit)),
    select: {
      id: true,
      token: true,
      note: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      createdAt: true,
      usedBy: { select: { name: true } }
    }
  });
  return rows.map((r) => toInviteSummary(r, clientUrl));
}

export async function revokeProInvite(adminUserId: string, inviteId: string): Promise<void> {
  // Só o admin que criou pode revogar (mesmo outros admins). Simples e
  // suficiente — admins comunicam off-band se precisarem revogar do colega.
  const invite = await prisma.proUpgradeInvite.findUnique({
    where: { id: inviteId },
    select: { createdById: true, usedAt: true, revokedAt: true }
  });
  if (!invite || invite.createdById !== adminUserId) {
    throw new AppError("Convite não encontrado", {
      statusCode: 404,
      code: "PRO_INVITE_NOT_FOUND"
    });
  }
  if (invite.usedAt) {
    throw new AppError("Convite já foi usado e não pode ser revogado.", {
      statusCode: 400,
      code: "PRO_INVITE_ALREADY_USED"
    });
  }
  if (invite.revokedAt) return; // idempotente

  await prisma.proUpgradeInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() }
  });
}

// ─── Redeem público ─────────────────────────────────────────────────────

export type ProInvitePreview = {
  valid: boolean;
  reason?: "USED" | "REVOKED" | "EXPIRED" | "NOT_FOUND";
  createdByName: string | null;
  note: string | null;
};

// Permite o frontend mostrar "Convite válido de XYZ — confirme pra virar
// PRO" ANTES de fazer o redeem destrutivo. Sem auth requerida — token
// já é segredo.
export async function previewProInvite(token: string): Promise<ProInvitePreview> {
  const invite = await prisma.proUpgradeInvite.findUnique({
    where: { token },
    select: {
      usedAt: true,
      revokedAt: true,
      expiresAt: true,
      note: true,
      createdBy: { select: { name: true } }
    }
  });
  if (!invite) {
    return { valid: false, reason: "NOT_FOUND", createdByName: null, note: null };
  }
  if (invite.usedAt) {
    return { valid: false, reason: "USED", createdByName: invite.createdBy?.name ?? null, note: invite.note };
  }
  if (invite.revokedAt) {
    return { valid: false, reason: "REVOKED", createdByName: invite.createdBy?.name ?? null, note: invite.note };
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return { valid: false, reason: "EXPIRED", createdByName: invite.createdBy?.name ?? null, note: invite.note };
  }
  return { valid: true, createdByName: invite.createdBy?.name ?? null, note: invite.note };
}

export async function redeemProInvite(
  userId: string,
  token: string
): Promise<{ plan: "PRO"; planExpiresAt: null }> {
  // Tudo dentro de transação: lock-and-mark do invite, update do user,
  // insert do log. Evita race de 2 cliques simultâneos consumirem o
  // mesmo invite.
  return prisma.$transaction(async (tx) => {
    const invite = await tx.proUpgradeInvite.findUnique({
      where: { token },
      select: {
        id: true,
        usedAt: true,
        revokedAt: true,
        expiresAt: true,
        createdById: true
      }
    });
    if (!invite) {
      throw new AppError("Convite inválido", {
        statusCode: 404,
        code: "PRO_INVITE_NOT_FOUND"
      });
    }
    if (invite.usedAt) {
      throw new AppError("Esse convite já foi usado.", {
        statusCode: 400,
        code: "PRO_INVITE_ALREADY_USED"
      });
    }
    if (invite.revokedAt) {
      throw new AppError("Esse convite foi revogado.", {
        statusCode: 400,
        code: "PRO_INVITE_REVOKED"
      });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new AppError("Esse convite expirou.", {
        statusCode: 400,
        code: "PRO_INVITE_EXPIRED"
      });
    }

    // Pega plan atual pra logar transição. Se já é PRO, retorna idempotente
    // SEM consumir o convite — admin pode mandar pra outra pessoa.
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true }
    });
    if (!user) {
      throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });
    }
    if (user.plan === "PRO") {
      throw new AppError(
        "Você já é PRO. Esse convite ainda está disponível — mande pra outra pessoa.",
        { statusCode: 409, code: "ALREADY_PRO" }
      );
    }

    // Marca invite como consumido.
    await tx.proUpgradeInvite.update({
      where: { id: invite.id },
      data: { usedById: userId, usedAt: new Date() }
    });

    // Atualiza user pra PRO. planExpiresAt fica null = lifetime (foi
    // grátis via convite admin).
    await tx.user.update({
      where: { id: userId },
      data: { plan: "PRO", planExpiresAt: null }
    });

    // Log de auditoria.
    await tx.subscriptionEvent.create({
      data: {
        userId,
        fromPlan: user.plan,
        toPlan: "PRO",
        source: "ADMIN_LINK",
        expiresAt: null,
        metadata: {
          inviteId: invite.id,
          createdById: invite.createdById
        }
      }
    });

    return { plan: "PRO" as const, planExpiresAt: null };
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

function toInviteSummary(
  row: {
    id: string;
    token: string;
    note: string | null;
    expiresAt: Date | null;
    usedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    usedBy: { name: string | null } | null;
  },
  clientUrl: string
): ProInviteSummary {
  // URL pública que o admin copia/manda. Forma: {CLIENT_URL}/pro-invite/{token}.
  const baseUrl = clientUrl.endsWith("/") ? clientUrl.slice(0, -1) : clientUrl;
  return {
    id: row.id,
    token: row.token,
    note: row.note,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    usedAt: row.usedAt?.toISOString() ?? null,
    usedByName: row.usedBy?.name ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    shareUrl: `${baseUrl}/pro-invite/${row.token}`
  };
}
