// DTO de usuario seguro (sem campos sensiveis) + mapper. Fonte unica de verdade,
// compartilhada por auth.service, auth-profile.service e google-oauth.service.
// toSafeUser e puro (so formatacao de data + plano inline) — sem dependencias.

export type SafeUser = {
  id: string;
  name: string | null;
  handle: string;
  email: string;
  role: "USER" | "COACH" | "ADMIN";
  sex: "MALE" | "FEMALE" | "OTHER";
  availableDaysPerWeek: number | null;
  // Onboarding v2 — todos null pra usuários antigos enquanto não editam
  // perfil; nunca quebra cliente legado, só enriquece quando preenchido.
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  experienceLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  primaryGoal: "STRENGTH" | "HYPERTROPHY" | "WEIGHT_LOSS" | "ENDURANCE" | "GENERAL_FITNESS" | null;
  // Tier comercial — usado pelo client pra renderizar badge PRO, esconder
  // upsell pra quem já é PRO, e mostrar limites corretos. ADMIN é resolvido
  // pra "PRO" automaticamente (vide resolveEffectivePlan no backend).
  plan: "FREE" | "PRO";
  planExpiresAt: string | null;
  // Aceite dos termos/privacidade. Frontend compara version contra a vigente
  // (CURRENT_TERMS_VERSION) e força re-aceite quando ficar defasado.
  acceptedTermsAt: string | null;
  acceptedTermsVersion: string | null;
  onboardingCompleted: boolean;
  isPrivate: boolean;
  showFollowLists: boolean;
  avatarUrl: string | null;
};

export function toSafeUser(user: {
  id: string;
  name: string | null;
  handle: string;
  email: string;
  role: "USER" | "COACH" | "ADMIN";
  sex: "MALE" | "FEMALE" | "OTHER";
  availableDaysPerWeek: number | null;
  onboardingCompletedAt: Date | null;
  // Onboarding v2 — opcionais no SELECT pra compat com chamadas que não
  // adicionaram as colunas. Quando ausentes, vão pra null no DTO.
  birthDate?: Date | null;
  heightCm?: number | null;
  weightKg?: number | null;
  experienceLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  primaryGoal?: "STRENGTH" | "HYPERTROPHY" | "WEIGHT_LOSS" | "ENDURANCE" | "GENERAL_FITNESS" | null;
  // Tier comercial — opcionais no SELECT pra compat. Default FREE quando
  // ausente. ADMIN é promovido a "PRO" no payload (assim o client renderiza
  // direto sem precisar saber que admins têm benefícios).
  plan?: "FREE" | "PRO";
  planExpiresAt?: Date | null;
  // Aceite dos termos — opcionais aqui pra compat com SELECTs antigos que
  // não os incluem. Valem null quando ausentes.
  acceptedTermsAt?: Date | null;
  acceptedTermsVersion?: string | null;
  isPrivate?: boolean;
  showFollowLists?: boolean;
  avatarUrl?: string | null;
}): SafeUser {
  // ADMIN herda PRO em runtime — vide resolveEffectivePlan no plan-limits.
  const effectivePlan: "FREE" | "PRO" =
    user.role === "ADMIN" ? "PRO" : user.plan ?? "FREE";
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    email: user.email,
    role: user.role,
    sex: user.sex,
    availableDaysPerWeek: user.availableDaysPerWeek,
    // birthDate vira string ISO-date (YYYY-MM-DD) pra simplificar serialização
    // pro cliente; null quando não preenchido.
    birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    heightCm: user.heightCm ?? null,
    weightKg: user.weightKg ?? null,
    experienceLevel: user.experienceLevel ?? null,
    primaryGoal: user.primaryGoal ?? null,
    plan: effectivePlan,
    planExpiresAt: user.planExpiresAt ? user.planExpiresAt.toISOString() : null,
    acceptedTermsAt: user.acceptedTermsAt ? user.acceptedTermsAt.toISOString() : null,
    acceptedTermsVersion: user.acceptedTermsVersion ?? null,
    onboardingCompleted: Boolean(user.onboardingCompletedAt && user.availableDaysPerWeek),
    isPrivate: user.isPrivate ?? false,
    showFollowLists: user.showFollowLists ?? true,
    avatarUrl: user.avatarUrl ?? null
  };
}
