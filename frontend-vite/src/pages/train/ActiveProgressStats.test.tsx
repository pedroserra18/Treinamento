import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActiveProgressStats } from './ActiveProgressStats'
import { makeActiveExercise, makeSet } from '../../test/factories'

// Componente só-leitura: deriva Volume / Séries / Progresso de activeExercises
// + totals. Estes testes travam o contrato de renderização antes do refactor
// de estado do TrainPage (rede de segurança).
describe('ActiveProgressStats', () => {
  it('mostra o volume arredondado e formatado em pt-BR e o total de séries', () => {
    render(
      <ActiveProgressStats
        activeExercises={[makeActiveExercise()]}
        totals={{ totalSeries: 12, totalVolumeKg: 1234.6 }}
      />,
    )
    // 1234.6 -> arredonda 1235 -> pt-BR "1.235" (ponto como separador de milhar)
    expect(screen.getByText('1.235')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('conta o progresso como exercícios com pelo menos uma série marcada', () => {
    const exercises = [
      makeActiveExercise({ exerciseId: 'a', sets: [makeSet({ checked: true })] }),
      makeActiveExercise({ exerciseId: 'b', sets: [makeSet({ checked: false })] }),
      makeActiveExercise({
        exerciseId: 'c',
        sets: [makeSet({ checked: false }), makeSet({ checked: true })],
      }),
    ]
    render(
      <ActiveProgressStats
        activeExercises={exercises}
        totals={{ totalSeries: 4, totalVolumeKg: 0 }}
      />,
    )
    // 2 de 3 exercícios têm série marcada
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('/3')).toBeInTheDocument()
    // barra: 2/3 = 67% (arredondado), exposta via aria-label
    expect(screen.getByLabelText('Progresso: 67%')).toBeInTheDocument()
  })

  it('sem exercícios: mostra 0 e não renderiza a barra de progresso', () => {
    render(
      <ActiveProgressStats activeExercises={[]} totals={{ totalSeries: 0, totalVolumeKg: 0 }} />,
    )
    expect(screen.getByText('/0')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Progresso:/)).not.toBeInTheDocument()
  })
})
