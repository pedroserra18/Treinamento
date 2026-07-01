import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SummaryMetricsCards } from './SummaryMetricsCards'
import { makeActiveExercise, makeSet } from '../../test/factories'

// Cards do resumo: Volume + Séries sempre; "Sets concluídos" / "vs último
// treino" / "PRs novos" só quando há info útil. O cálculo é testado em
// summary-metrics.test.ts; aqui travamos a renderização condicional.
describe('SummaryMetricsCards', () => {
  const baseProps = {
    prByExerciseId: {},
    prSnapshotAtStart: {},
    originMode: 'EMPTY' as const,
    activePlanId: '',
    lastUseByPlanId: {},
    elapsedSec: 0,
    summaryDurationMin: '',
  }

  it('sempre mostra Volume e Séries com os valores de totals', () => {
    render(
      <SummaryMetricsCards
        {...baseProps}
        activeExercises={[makeActiveExercise({ sets: [makeSet({ checked: true })] })]}
        totals={{ totalSeries: 5, totalVolumeKg: 2500 }}
      />,
    )
    expect(screen.getByText('Volume')).toBeInTheDocument()
    expect(screen.getByText('Séries')).toBeInTheDocument()
    expect(screen.getByText('2.500')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('mostra "Sets concluídos" com a % quando nem todas as séries foram marcadas', () => {
    render(
      <SummaryMetricsCards
        {...baseProps}
        activeExercises={[
          makeActiveExercise({ sets: [makeSet({ checked: true }), makeSet({ checked: false })] }),
        ]}
        totals={{ totalSeries: 2, totalVolumeKg: 100 }}
      />,
    )
    expect(screen.getByText('Sets concluídos')).toBeInTheDocument()
    expect(screen.getByText('50% das séries marcadas')).toBeInTheDocument()
  })

  it('esconde "Sets concluídos" quando 100% das séries foram marcadas', () => {
    render(
      <SummaryMetricsCards
        {...baseProps}
        activeExercises={[makeActiveExercise({ sets: [makeSet({ checked: true })] })]}
        totals={{ totalSeries: 1, totalVolumeKg: 100 }}
      />,
    )
    expect(screen.queryByText('Sets concluídos')).not.toBeInTheDocument()
  })
})
