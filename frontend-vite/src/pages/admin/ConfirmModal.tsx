import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { PendingAction } from './admin-users-utils'

export function ConfirmModal({
  action,
  loading,
  onConfirm,
  onCancel,
}: {
  action: PendingAction
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const config =
    action.kind === 'role'
      ? {
          title: 'Alterar acesso',
          body: `O usuário passará a ter acesso de ${action.newRole}. Isso muda o que a conta pode fazer no sistema, imediatamente.`,
          confirm: 'Alterar acesso',
          btn: 'bg-[var(--brand)] hover:bg-[var(--brand-strong)]',
        }
      : action.kind === 'plan'
      ? {
          title: action.newPlan === 'PRO' ? 'Promover pra PRO' : 'Rebaixar pra FREE',
          body: action.newPlan === 'PRO'
            ? 'O usuário ganha acesso PRO imediatamente — limites ilimitados em rotinas, IA, exercícios. A mudança é registrada no histórico de assinatura.'
            : 'O usuário volta pro tier FREE. Recursos atuais ficam, mas novos uploads/criações vão respeitar os limites do free. A mudança é registrada no histórico.',
          confirm: action.newPlan === 'PRO' ? 'Tornar PRO' : 'Rebaixar pra FREE',
          btn: action.newPlan === 'PRO'
            ? 'bg-amber-500 hover:bg-amber-600'
            : 'bg-[var(--brand)] hover:bg-[var(--brand-strong)]',
        }
      : {
          deactivate: {
            title: 'Desativar conta',
            body: 'A conta será desativada e as sessões revogadas. O usuário não poderá entrar até ser reativado.',
            confirm: 'Desativar',
            btn: 'bg-amber-500 hover:bg-amber-600',
          },
          delete: {
            title: 'Excluir conta',
            body: 'Esta ação remove a conta da listagem ativa e revoga os acessos. Não pode ser desfeita pela interface.',
            confirm: 'Excluir',
            btn: 'bg-red-600 hover:bg-red-700',
          },
          reactivate: {
            title: 'Reativar conta',
            body: 'A conta voltará a ficar ativa e o usuário poderá entrar novamente.',
            confirm: 'Reativar',
            btn: 'bg-emerald-600 hover:bg-emerald-700',
          },
        }[action.kind]

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [loading, onCancel])

  // Exclusão exige digitar o e-mail (padrão de confirmação de alto risco).
  const requiresTyping = action.kind === 'delete'
  const [confirmText, setConfirmText] = useState('')
  const confirmed = !requiresTyping || confirmText.trim().toLowerCase() === action.user.email.toLowerCase()

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !loading && onCancel()}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--text)]">{config.title}</h2>
          <button type="button" onClick={() => !loading && onCancel()} className="grid h-7 w-7 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)]" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{config.body}</p>
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
          <div className="text-sm font-semibold text-[var(--text)]">{action.user.name ?? 'Sem nome'}</div>
          <div className="font-mono text-[12px] text-[var(--muted)]">{action.user.email}</div>
        </div>
        {requiresTyping ? (
          <div className="mt-3">
            <label className="text-[12px] text-[var(--muted)]">
              Digite <span className="font-mono font-semibold text-[var(--text)]">{action.user.email}</span> para confirmar:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={loading}
              autoComplete="off"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
            />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={loading} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={loading || !confirmed} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40 ${config.btn}`}>
            {loading ? 'Processando…' : config.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
