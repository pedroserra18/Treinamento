// Cálculo das métricas exibidas no resumo do treino (PRs novos, % de séries
// concluídas, comparação de duração vs último treino). Função pura — recebe o
// estado relevante e devolve os números prontos pra renderizar. Fica separada
// do componente pra poder ser testada sem montar React.
import { localDayKey } from './helpers'
import type { ActiveExercise, TrainOriginMode } from './types'

export type LastUseInfo = {
  endedAt: string
  durationSec: number | null
  planId: string
  planName: string
}

export type SummaryNewPr = { name: string; load: number; previous: number | null }

export type SummaryMetrics = {
  newPrs: SummaryNewPr[]
  completedSetsCount: number
  totalSetsAttempted: number
  completePct: number
  durationDelta: number | null
  lastDurationMin: number | null
  lastSessionEndedAt: string | null
  hasSecondRow: boolean
}

export function computeSummaryMetrics(input: {
  prByExerciseId: Record<string, number | null>
  prSnapshotAtStart: Record<string, number>
  activeExercises: ActiveExercise[]
  originMode: TrainOriginMode
  activePlanId: string
  lastUseByPlanId: Record<string, LastUseInfo>
  elapsedSec: number
}): SummaryMetrics {
  const {
    prByExerciseId,
    prSnapshotAtStart,
    activeExercises,
    originMode,
    activePlanId,
    lastUseByPlanId,
    elapsedSec,
  } = input

  const newPrs = Object.entries(prByExerciseId).reduce<SummaryNewPr[]>((acc, [exId, currentPr]) => {
    if (currentPr == null) return acc
    const previous = prSnapshotAtStart[exId] ?? null
    if (previous == null || currentPr > previous) {
      const ex = activeExercises.find((e) => e.exerciseId === exId)
      if (ex) acc.push({ name: ex.exerciseName, load: currentPr, previous })
    }
    return acc
  }, [])

  const totalSetsAttempted = activeExercises.reduce((s, ex) => s + ex.sets.length, 0)
  const completedSetsCount = activeExercises.reduce((s, ex) => s + ex.sets.filter((set) => set.checked).length, 0)
  const completePct = totalSetsAttempted > 0 ? Math.round((completedSetsCount / totalSetsAttempted) * 100) : 0

  // "vs último treino" só faz sentido quando:
  //   • A rotina já tem ≥1 sessão anterior em outro dia (não o que acabamos
  //     de fazer) — evita comparar contra a versão de hoje mais cedo.
  //   • A duração anterior é minimamente significativa (≥5 min) pra não
  //     comparar contra um treino abortado.
  const lastSession = originMode === 'ROUTINE' && activePlanId ? lastUseByPlanId[activePlanId] : null
  // Dia LOCAL (não UTC) pra não suprimir/exibir a comparação errado perto da
  // meia-noite (Brasil UTC-3).
  const lastDayKey = lastSession ? localDayKey(new Date(lastSession.endedAt)) : null
  const todayKey = localDayKey(new Date())
  const isDifferentDay = lastDayKey != null && lastDayKey !== todayKey
  const lastDurationMin = lastSession?.durationSec ? Math.round(lastSession.durationSec / 60) : null
  const currentDurationMin = Math.max(1, Math.round(elapsedSec / 60))
  const canCompareDuration = isDifferentDay && lastDurationMin != null && lastDurationMin >= 5
  const durationDelta = canCompareDuration ? currentDurationMin - lastDurationMin! : null

  const hasSecondRow = newPrs.length > 0 || durationDelta != null || completePct < 100

  return {
    newPrs,
    completedSetsCount,
    totalSetsAttempted,
    completePct,
    durationDelta,
    lastDurationMin,
    lastSessionEndedAt: lastSession?.endedAt ?? null,
    hasSecondRow,
  }
}
