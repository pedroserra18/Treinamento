import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetTypeBadge } from './SetTypeControls'

// Badge de tipo de série: série normal mostra o número; tipos especiais mostram
// a letra (W/P/F/D/C). É um botão acessível que dispara onClick pra abrir o
// picker. Travamos esse contrato antes de mexer no estado do TrainPage.
describe('SetTypeBadge', () => {
  it('série normal mostra o número (index+1) e tem rótulo acessível', () => {
    render(<SetTypeBadge index={2} setType="normal" checked={false} onClick={() => {}} />)
    const btn = screen.getByRole('button', { name: /Série 3/ })
    expect(btn).toHaveTextContent('3')
    expect(btn).toHaveAccessibleName(/Série Normal/)
  })

  it('tipos especiais mostram a letra correspondente (drop = D)', () => {
    render(<SetTypeBadge index={0} setType="drop" checked={false} onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('D')
  })

  it('dispara onClick ao tocar', async () => {
    const onClick = vi.fn()
    render(<SetTypeBadge index={0} setType="normal" checked={false} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
