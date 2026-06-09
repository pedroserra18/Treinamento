// Tabela centralizada das features tier-restricted + textos contextuais
// pro PlanLimitDialog. Quando o backend emite PLAN_LIMIT_REACHED, ele
// devolve `details.feature` que casa com uma das chaves abaixo. O dialog
// usa essa chave pra renderizar título + descrição certos.
//
// IMPORTANTE: manter sincronizado com api/src/shared/plan-limits.ts.
// Adicionar uma feature aqui SEM adicionar lá não tem efeito (backend
// nunca emite o code), e vice-versa (o dialog cai pra texto genérico).

export type PlanFeature =
  | 'workoutPlans'
  | 'aiGenerations'
  | 'aiHistoryEntries'
  | 'customExercises'
  | 'competitionsOwned'
  | 'pinnedExercises'

type FeatureCopy = {
  title: string
  // {current} e {limit} são interpolados pelo dialog. Mantemos como
  // template pra fácil traduzir/ajustar tom sem mexer no componente.
  body: (params: { current: number; limit: number }) => string
  // Verbo de ação alternativa pro tier FREE liberar slot
  // (ex.: "Apague uma" pra rotinas, "Encerre uma" pra competições).
  actionHint?: string
}

export const FEATURE_COPY: Record<PlanFeature, FeatureCopy> = {
  workoutPlans: {
    title: 'Limite de rotinas atingido',
    body: ({ limit }) =>
      `Você já tem ${limit} rotinas, o teto do plano grátis. Apague uma ou faça upgrade pro PRO pra criar quantas quiser.`,
    actionHint: 'Apagar uma rotina'
  },
  aiGenerations: {
    title: 'Limite de gerações atingido',
    body: ({ limit }) =>
      `Você já gerou ${limit} treinos com a IA, o limite do plano grátis. Faça upgrade pro PRO pra gerar quantos treinos quiser — sem voltar mais à tela de upgrade.`
  },
  aiHistoryEntries: {
    title: 'Histórico cheio',
    body: ({ limit }) =>
      `Você só pode manter ${limit} gerações de IA no histórico. PRO guarda até 50.`
  },
  customExercises: {
    title: 'Limite de exercícios atingido',
    body: ({ limit }) =>
      `Você já criou ${limit} exercícios personalizados. Apague algum ou faça upgrade pro PRO pra criar ilimitados.`,
    actionHint: 'Apagar um exercício'
  },
  competitionsOwned: {
    title: 'Limite de competições atingido',
    body: ({ limit }) =>
      `Você já tem ${limit} competições ativas como dono. Encerre uma ou faça upgrade pro PRO pra criar ilimitadas.`,
    actionHint: 'Encerrar uma competição'
  },
  pinnedExercises: {
    title: 'Limite de exercícios fixados atingido',
    body: ({ limit }) =>
      `Você já fixou ${limit} exercícios. Faça upgrade pro PRO pra fixar até 20.`
  }
}

// Helper de runtime — caller passa o `details` do error e a gente
// devolve a copy certa. Sem match, devolve um texto genérico decente.
export function getFeatureCopy(
  feature: string | undefined,
  current: number,
  limit: number,
): { title: string; body: string; actionHint?: string } {
  const known = (feature ?? '') as PlanFeature
  const copy = FEATURE_COPY[known]
  if (!copy) {
    return {
      title: 'Limite do plano grátis atingido',
      body: `Você atingiu o limite (${limit}) desse recurso no plano grátis. Faça upgrade pro PRO pra continuar.`,
    }
  }
  return {
    title: copy.title,
    body: copy.body({ current, limit }),
    actionHint: copy.actionHint,
  }
}

// Intercepta o ApiError com code === 'PLAN_LIMIT_REACHED', extrai os
// details e abre o PlanLimitDialog via showLimit. Retorna true se
// tratou (caller deve `return` em seguida); false pra propagar pro
// handler normal de erro.
//
// Usado nos callers que disparam mutations gateadas (createPlan, AI
// generate, createExercise etc.):
//
//   try { await createPlan(...) }
//   catch (err) {
//     if (catchPlanLimitError(err, showLimit)) return
//     setError(err.message)
//   }
export function catchPlanLimitError(
  err: unknown,
  showLimit: (feature: string, current: number, limit: number) => void,
): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; details?: unknown }
  if (e.code !== 'PLAN_LIMIT_REACHED') return false
  const details = (e.details ?? {}) as { feature?: string; current?: number; limit?: number | null }
  // limit null no backend = ilimitado; pra esse error nunca deveria
  // chegar, mas vamos defensivos com fallback 0.
  showLimit(
    details.feature ?? '',
    typeof details.current === 'number' ? details.current : 0,
    typeof details.limit === 'number' ? details.limit : 0,
  )
  return true
}
