import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Ban, Crown, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react'
import type { AdminUserDetail } from '../../types/admin'
import {
  avatarGradient,
  initials,
  formatDate,
  relativeTime,
  onboardingProgress,
  onboardingMissing,
  EVENT_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  roleTone,
  type Role,
} from './admin-users-utils'
import { Pill, StatusPill, DetailRow } from './admin-users-ui'

export function UserDrawer({
  detail,
  loading,
  isSelf,
  onClose,
  onRoleChange,
  onPlanChange,
  onAction,
}: {
  detail: AdminUserDetail | null
  loading: boolean
  isSelf: boolean
  onClose: () => void
  onRoleChange: (role: Role) => void
  onPlanChange: (newPlan: 'FREE' | 'PRO') => void
  onAction: (kind: 'deactivate' | 'reactivate' | 'delete') => void
}) {
  const u = detail?.user
  const [roleDraft, setRoleDraft] = useState<Role>('USER')
  // Sincroniza o draft com o usuário carregado sem useEffect (padrão de ajuste
  // de estado durante o render — reseta quando o id do usuário muda).
  const [syncedId, setSyncedId] = useState<string | null>(null)
  if (u && u.id !== syncedId) {
    setSyncedId(u.id)
    setRoleDraft(u.role)
  }

  const onb = u ? onboardingProgress(u) : { filled: 0, total: 6 }
  const onbFully = onb.filled === onb.total
  const onbMissing = u ? onboardingMissing(u) : []

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header — pt-safe-plus-4 empurra o conteúdo pra baixo do
            status bar (hora/bateria/notch) quando o app roda como PWA
            standalone no iOS. Sem isso, o X fica embaixo da bateria e
            não dá pra tocar. py-4 substituído pra pb-4 + pt-safe-plus-4. */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-5 pb-4 pt-safe-plus-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Detalhes do usuário</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {loading || !u ? (
          <div className="space-y-3 p-5">
            <div className="h-16 w-full animate-pulse rounded-xl bg-[var(--surface-hover)]" />
            <div className="h-24 w-full animate-pulse rounded-xl bg-[var(--surface-hover)]" />
            <div className="h-40 w-full animate-pulse rounded-xl bg-[var(--surface-hover)]" />
          </div>
        ) : (
          <div className="p-5">
            {/* Identidade */}
            <div className="flex items-center gap-3">
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-full text-lg font-semibold text-white" style={{ background: avatarGradient(u.id) }}>
                  {initials(u.name, u.email)}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-base font-bold text-[var(--text)]">{u.name ?? 'Sem nome'}</span>
                  {u.mfaEnabled ? <ShieldCheck size={15} className="text-emerald-500" /> : null}
                </div>
                <div className="truncate font-mono text-[11px] text-[var(--muted)]">{u.handle ? `@${u.handle}` : `ID ${u.id.slice(0, 12)}`}</div>
                <div className="truncate font-mono text-[11px] text-[var(--muted)]">{u.email}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Pill tone={u.accountType === 'TEST' ? 'test' : 'real'}>{u.accountType === 'TEST' ? 'Teste' : 'Real'}</Pill>
              <Pill tone={roleTone(u.role)}>{u.role}</Pill>
              {u.role === 'ADMIN' ? (
                <Pill tone="pro">
                  <Crown size={9} /> auto-PRO
                </Pill>
              ) : u.plan === 'PRO' ? (
                <Pill tone="pro">
                  <Crown size={9} /> PRO
                </Pill>
              ) : (
                <Pill tone="free">FREE</Pill>
              )}
              <StatusPill status={u.status} />
            </div>

            {/* Stats */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { k: 'Planos', v: detail.stats.workoutPlanCount },
                { k: 'Treinos IA', v: detail.stats.aiPlansGenerated },
                { k: 'Sessões', v: detail.stats.workoutSessionCount },
                { k: 'Concluídas', v: detail.stats.completedSessionCount },
                { k: 'Seguidores', v: detail.stats.followersCount },
                { k: 'Seguindo', v: detail.stats.followingCount },
                { k: 'Dias/sem', v: u.availableDaysPerWeek ?? '—' },
                { k: 'IA gerados', v: u.aiGenerationsTotal ?? 0 },
                { k: 'Convites PRO', v: `${detail.stats.proInvitesCreatedCount}↑ ${detail.stats.proInvitesUsedCount}↓` },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5 text-center">
                  <div className="text-lg font-bold text-[var(--text)]">{s.v}</div>
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">{s.k}</div>
                </div>
              ))}
            </div>

            {/* Campos */}
            <div className="mt-5 rounded-xl border border-[var(--line)] px-3.5 py-1">
              <DetailRow
                label="Assinatura"
                value={u.role === 'ADMIN' ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300" title="ADMIN é promovido a PRO em runtime sem precisar de upgrade explícito">
                    <Crown size={12} /> auto-PRO
                  </span>
                ) : u.plan === 'PRO' ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300">
                    <Crown size={12} /> PRO
                  </span>
                ) : (
                  <span className="text-[var(--muted)]">FREE</span>
                )}
              />
              {u.plan === 'PRO' && u.planExpiresAt ? (
                <DetailRow label="PRO expira em" value={`${formatDate(u.planExpiresAt)} · ${relativeTime(u.planExpiresAt)}`} />
              ) : null}
              <DetailRow label="MFA / 2FA" value={u.mfaEnabled ? <span className="text-emerald-600 dark:text-emerald-400">Ativado</span> : <span className="text-[var(--muted)]">Desativado</span>} />
              <DetailRow label="E-mail verificado" value={u.emailVerifiedAt ? formatDate(u.emailVerifiedAt) : <span className="text-[var(--muted)]">Não</span>} />
              <DetailRow
                label="Onboarding"
                value={
                  onbFully ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-emerald-600 dark:text-emerald-400">Completo</span>
                      {u.onboardingCompletedAt ? <span className="text-[var(--muted)]">· {formatDate(u.onboardingCompletedAt)}</span> : null}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-[5px] w-14 overflow-hidden rounded-full bg-[var(--line)]">
                        <span
                          className="block h-full rounded-full bg-amber-400"
                          style={{ width: `${Math.max(8, Math.round((onb.filled / onb.total) * 100))}%` }}
                        />
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">{onb.filled}/{onb.total}</span>
                    </span>
                  )
                }
              />
              {!onbFully && onbMissing.length > 0 ? (
                <DetailRow
                  label="Faltando"
                  value={<span className="text-right text-amber-600 dark:text-amber-400">{onbMissing.join(', ')}</span>}
                />
              ) : null}
              <DetailRow label="Nascimento" value={u.birthDate ? formatDate(u.birthDate) : '—'} />
              <DetailRow label="Sexo" value={u.sex === 'MALE' ? 'Masculino' : u.sex === 'FEMALE' ? 'Feminino' : 'Outro'} />
              <DetailRow label="Altura" value={u.heightCm ? `${u.heightCm} cm` : '—'} />
              <DetailRow label="Peso" value={u.weightKg ? `${u.weightKg} kg` : '—'} />
              <DetailRow label="Experiência" value={u.experienceLevel ? EXPERIENCE_LABELS[u.experienceLevel] ?? u.experienceLevel : '—'} />
              <DetailRow label="Objetivo" value={u.primaryGoal ? GOAL_LABELS[u.primaryGoal] ?? u.primaryGoal : '—'} />
              <DetailRow label="Cadastro" value={`${formatDate(u.createdAt)} · ${relativeTime(u.createdAt)}`} />
              <DetailRow label="Último login" value={u.lastLoginAt ? `${formatDate(u.lastLoginAt)} · ${relativeTime(u.lastLoginAt)}` : '—'} />
            </div>

            {/* Gestão de acesso (role) */}
            <div className="mt-5">
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Acesso</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                Define o que a conta pode fazer no sistema (separado da assinatura).
                <br />
                · <strong className="text-[var(--text)]">USER</strong>: conta comum, usa o app respeitando limites da assinatura.
                <br />
                · <strong className="text-[var(--text)]">ADMIN</strong>: acessa o painel admin, gera convites PRO,
                banir/excluir contas. Vira PRO automaticamente em runtime — não precisa de upgrade explícito.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={roleDraft}
                  onChange={(e) => setRoleDraft(e.target.value as Role)}
                  disabled={isSelf}
                  className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                <button
                  type="button"
                  onClick={() => onRoleChange(roleDraft)}
                  disabled={isSelf || roleDraft === u.role}
                  className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
                >
                  Aplicar
                </button>
              </div>
              {isSelf ? <p className="mt-1.5 text-[11px] text-[var(--muted)]">Você não pode alterar o próprio acesso.</p> : null}
            </div>

            {/* Gestão de assinatura (plan) — só faz sentido pra USER, já que
                ADMIN é auto-PRO em runtime. Mostra estado bloqueado pra
                admin pra deixar claro a regra. */}
            <div className="mt-5">
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Assinatura</h3>
              {u.role === 'ADMIN' ? (
                <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-3 text-[12px] text-[var(--muted)]">
                  Admins são <strong className="text-[var(--text)]">PRO automaticamente</strong> em runtime.
                  Mudar o plan no banco não tem efeito enquanto o acesso for ADMIN —
                  troque pra USER acima se quiser gerenciar a assinatura.
                </div>
              ) : u.plan === 'PRO' ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-700 dark:text-amber-300">
                      <Crown size={13} /> Plano PRO ativo
                    </span>
                    {u.planExpiresAt ? (
                      <span className="font-mono text-[10.5px] text-[var(--muted)]">expira {formatDate(u.planExpiresAt)}</span>
                    ) : (
                      <span className="font-mono text-[10.5px] text-[var(--muted)]">vitalício</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onPlanChange('FREE')}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] py-2 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  >
                    Rebaixar pra FREE
                  </button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
                    <span className="text-[13px] font-semibold text-[var(--muted)]">Plano FREE</span>
                    <span className="font-mono text-[10.5px] text-[var(--muted)]">limites aplicados</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPlanChange('PRO')}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-[var(--brand)] py-2 text-[13px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(245,158,11,0.55)] transition-transform hover:scale-[1.01]"
                  >
                    <Crown size={13} /> Tornar PRO
                  </button>
                  <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
                    Promoção direta, sem convite. Histórico de assinatura registra a mudança e quem fez.
                  </p>
                </div>
              )}
            </div>

            {/* Ações rápidas */}
            <div className="mt-5 flex flex-wrap gap-2">
              {u.status === 'DISABLED' ? (
                <button type="button" onClick={() => onAction('reactivate')} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/15">
                  <RotateCcw size={14} /> Reativar
                </button>
              ) : (
                <button type="button" onClick={() => onAction('deactivate')} disabled={isSelf} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/15">
                  <Ban size={14} /> Desativar
                </button>
              )}
              <button type="button" onClick={() => onAction('delete')} disabled={isSelf} className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/15">
                <Trash2 size={14} /> Excluir
              </button>
            </div>

            {/* Histórico de ações admin */}
            <div className="mt-5">
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Ações administrativas recentes</h3>
              {detail.recentEvents.length === 0 ? (
                <p className="mt-2 text-[13px] text-[var(--muted)]">Nenhuma ação registrada.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {detail.recentEvents.map((ev) => (
                    <li key={ev.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2">
                      <span className="text-[12.5px] text-[var(--text)]">{EVENT_LABELS[ev.action] ?? ev.action}</span>
                      <span className="font-mono text-[10px] text-[var(--muted)]">{formatDate(ev.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
