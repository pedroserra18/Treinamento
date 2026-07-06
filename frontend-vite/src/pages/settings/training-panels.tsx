import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Crown, Dumbbell, Sparkles, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import {
  deletePrivateExercise,
  getMyExerciseStats,
  getMyPrivateExercises,
  type MyExerciseStats,
} from '../../services/workoutService'
import type { ExerciseOption } from '../../types/workout'
import { updateProfileFields } from '../../services/authService'
import {
  getPlanSummary,
  redeemProInvite,
  type PlanFeatureKey,
  type PlanSummary,
} from '../../services/subscriptionService'
import type { AuthUser, ExperienceLevel, PrimaryGoal } from '../../types/auth'

// ─── My Exercises Panel ───────────────────────────────────────────────────
// Gerencia os exercícios PRIVATE criados pelo próprio usuário. Mostra o
// contador X/Y do plano FREE, lista cada exercício com botão de excluir e
// um ConfirmDialog destructive como guarda. Exclusão é soft-delete no
// backend — preserva histórico de treinos antigos que usaram o exercício.
export function MyExercisesPanel({
  authorizedFetch,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}) {
  const [items, setItems] = useState<ExerciseOption[] | null>(null)
  const [stats, setStats] = useState<MyExerciseStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ExerciseOption | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Carrega lista + stats em paralelo. Stats vem por endpoint dedicado
  // (também usa o backend pra contar) pra ficar consistente com o que o
  // CreateExerciseModal mostra — assim o usuário vê o mesmo "3/5 criados"
  // nos dois lugares.
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getMyPrivateExercises(authorizedFetch),
      getMyExerciseStats(authorizedFetch),
    ])
      .then(([rows, s]) => {
        if (cancelled) return
        setItems(rows)
        setStats(s)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar')
      })
    return () => { cancelled = true }
  }, [authorizedFetch])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setDeletingId(target.id)
    setDeleteError(null)
    try {
      await deletePrivateExercise(authorizedFetch, target.id)
      setItems((current) => (current ?? []).filter((ex) => ex.id !== target.id))
      setStats((current) => (current ? { ...current, created: Math.max(0, current.created - 1) } : current))
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Falha ao excluir')
    } finally {
      setDeletingId(null)
    }
  }

  const counterLabel = stats && stats.limit !== null
    ? `${stats.created}/${stats.limit} criados`
    : stats ? `${stats.created} criados` : null
  const atLimit = stats !== null && stats.limit !== null && stats.created >= stats.limit

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-base font-bold text-[var(--text)]">Meus exercícios</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          Exercícios que você criou no app. Apague aqui pra liberar espaço pro plano gratuito —
          treinos e rotinas antigos que usam algum deles continuam funcionando.
        </p>
      </header>

      {counterLabel && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-3">
          <div>
            <p className={`text-[14px] font-bold tabular-nums ${atLimit ? 'text-rose-500' : 'text-[var(--text)]'}`}>
              {counterLabel}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              {atLimit
                ? 'Limite do plano gratuito atingido. Em breve, plano Pro com criação ilimitada.'
                : 'Plano gratuito permite até 5 exercícios personalizados.'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-center text-[12px] text-rose-500">
          {error}
        </p>
      )}

      {items === null && !error && (
        <p className="px-4 py-8 text-center text-[12px] text-[var(--muted)]">Carregando…</p>
      )}

      {items !== null && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center">
          <Dumbbell size={28} className="mx-auto text-[var(--muted)]" />
          <p className="mt-2 text-[13px] font-medium text-[var(--text)]">
            Você ainda não criou nenhum exercício
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Crie exercícios personalizados pelo botão "Criar" dentro de "Adicionar Exercício" em qualquer treino.
          </p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-[var(--line)]">
          {items.map((option, idx) => (
            <li
              key={option.id}
              className={`flex items-center gap-3 bg-[var(--surface)] px-3 py-3 ${
                idx < items.length - 1 ? 'border-b border-[var(--line)]' : ''
              }`}
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                {option.thumbnailUrl ? (
                  <img src={option.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Dumbbell size={18} className="text-[var(--muted)]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text)]">{option.name}</p>
                {option.primaryMuscleGroup && (
                  <p className="truncate text-[11px] text-[var(--muted)]">
                    {option.primaryMuscleGroup}{option.equipment ? ` • ${option.equipment}` : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setDeleteError(null); setPendingDelete(option) }}
                aria-label={`Excluir ${option.name}`}
                title="Excluir"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-500"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir exercício?"
        message={
          deleteError
            ? `Não foi possível excluir "${pendingDelete?.name ?? ''}": ${deleteError}`
            : `"${pendingDelete?.name ?? ''}" será removido dos seus exercícios personalizados. Treinos e rotinas antigos que usam esse exercício continuam preservados.`
        }
        destructive
        confirmLabel={deletingId !== null ? 'Excluindo…' : 'Excluir'}
        onConfirm={() => { void confirmDelete() }}
        onCancel={() => {
          if (deletingId !== null) return
          setPendingDelete(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}

// ─── Training Profile Panel ───────────────────────────────────────────────
// Edita os campos do perfil profissional definidos no onboarding v2:
// altura, peso atual, nível de experiência, objetivo principal e
// dias por semana. Cada bloco salva independente via PATCH /auth/profile
// (partial update). Mudanças pré-preenchem o quiz da IA automaticamente
// na próxima geração de plano.
const EXPERIENCE_LABELS_PT: Record<ExperienceLevel, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
}
const GOAL_LABELS_PT: Record<PrimaryGoal, string> = {
  STRENGTH: 'Força',
  HYPERTROPHY: 'Hipertrofia',
  WEIGHT_LOSS: 'Emagrecimento',
  ENDURANCE: 'Resistência',
  GENERAL_FITNESS: 'Saúde geral',
}

export function TrainingProfilePanel({
  authorizedFetch, applyUserPatch, user,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  applyUserPatch: (patch: Partial<AuthUser>) => void
  user: AuthUser | null
}) {
  // Estado local "draft" pra cada campo. Inicializa do user; quando muda
  // (login em outra aba, refresh), useEffect re-sincroniza.
  const [heightCm, setHeightCm] = useState<string>(user?.heightCm != null ? String(user.heightCm) : '')
  const [weightKg, setWeightKg] = useState<string>(user?.weightKg != null ? String(user.weightKg) : '')
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(user?.experienceLevel ?? null)
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(user?.primaryGoal ?? null)
  const [daysPerWeek, setDaysPerWeek] = useState<number>(user?.availableDaysPerWeek ?? 4)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedField, setSavedField] = useState<string | null>(null)

  useEffect(() => {
    setHeightCm(user?.heightCm != null ? String(user.heightCm) : '')
    setWeightKg(user?.weightKg != null ? String(user.weightKg) : '')
    setExperienceLevel(user?.experienceLevel ?? null)
    setPrimaryGoal(user?.primaryGoal ?? null)
    setDaysPerWeek(user?.availableDaysPerWeek ?? 4)
  }, [user?.heightCm, user?.weightKg, user?.experienceLevel, user?.primaryGoal, user?.availableDaysPerWeek])

  // Helper genérico de save — recebe o patch a aplicar, faz fetch, refresca
  // estado local da sessão e marca o feedback visual.
  const savePatch = async (patch: Parameters<typeof updateProfileFields>[1], fieldLabel: string): Promise<void> => {
    setSaving(true)
    setError(null)
    setSavedField(null)
    try {
      const updated = await updateProfileFields(authorizedFetch, patch)
      applyUserPatch(updated)
      setSavedField(fieldLabel)
      window.setTimeout(() => setSavedField(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const saveHeight = async (): Promise<void> => {
    const trimmed = heightCm.trim()
    if (trimmed === '') return savePatch({ heightCm: null }, 'altura')
    const v = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(v) || v < 100 || v > 250) {
      setError('Altura inválida (entre 100 e 250 cm).')
      return
    }
    return savePatch({ heightCm: v }, 'altura')
  }

  const saveWeight = async (): Promise<void> => {
    const trimmed = weightKg.trim()
    if (trimmed === '') return savePatch({ weightKg: null }, 'peso')
    const v = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(v) || v < 25 || v > 300) {
      setError('Peso inválido (entre 25 e 300 kg).')
      return
    }
    return savePatch({ weightKg: v }, 'peso')
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-base font-bold text-[var(--text)]">Perfil de treino</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          Essas informações pré-preenchem o quiz da IA e personalizam recomendações. Pode atualizar quando precisar.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-500">{error}</p>
      )}
      {savedField && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-500">
          {savedField} salvo ✓
        </p>
      )}

      {/* Altura */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Altura (cm)</label>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="Ex.: 175"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
          />
          <button
            type="button"
            onClick={() => void saveHeight()}
            disabled={saving}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Peso */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Peso atual (kg)</label>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            placeholder="Ex.: 72"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
          />
          <button
            type="button"
            onClick={() => void saveWeight()}
            disabled={saving}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Você também pode registrar peso na página de Progresso, com data e foto.
        </p>
      </div>

      {/* Nível de experiência */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Nível de experiência</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(EXPERIENCE_LABELS_PT) as ExperienceLevel[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setExperienceLevel(opt)
                void savePatch({ experienceLevel: opt }, 'experiência')
              }}
              disabled={saving}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                experienceLevel === opt
                  ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--text)]'
                  : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--brand)]/40'
              } disabled:opacity-50`}
            >
              {EXPERIENCE_LABELS_PT[opt]}
            </button>
          ))}
        </div>
      </div>

      {/* Objetivo principal */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Objetivo principal</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(Object.keys(GOAL_LABELS_PT) as PrimaryGoal[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setPrimaryGoal(opt)
                void savePatch({ primaryGoal: opt }, 'objetivo')
              }}
              disabled={saving}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                primaryGoal === opt
                  ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--text)]'
                  : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--brand)]/40'
              } disabled:opacity-50`}
            >
              {GOAL_LABELS_PT[opt]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Pode ser ajustado por plano específico no quiz da IA.
        </p>
      </div>

      {/* Dias por semana */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Dias disponíveis por semana</label>
        <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <input
            type="range"
            min={1}
            max={7}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value))}
            onMouseUp={() => void savePatch({ availableDaysPerWeek: daysPerWeek }, 'dias')}
            onTouchEnd={() => void savePatch({ availableDaysPerWeek: daysPerWeek }, 'dias')}
            className="w-full"
            disabled={saving}
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-2xl font-black text-[var(--text)]">{daysPerWeek} dias</p>
            <p className="text-xs text-[var(--muted)]">Salvo ao soltar o slider</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Plan Panel ───────────────────────────────────────────────────────────
// Mostra o tier atual + uso/limites por feature + campo "Tenho um convite"
// pra colar o token. Em FREE, exibe CTA "Em breve com plano pago" como
// placeholder pro futuro checkout.
const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  workoutPlans: 'Rotinas',
  aiGenerations: 'Gerações de IA',
  aiHistoryEntries: 'Histórico de IA',
  customExercises: 'Exercícios personalizados',
  competitionsOwned: 'Competições como dono',
  pinnedExercises: 'Exercícios fixados',
}

export function PlanPanel({
  authorizedFetch, refreshUser, user,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  refreshUser: () => Promise<void>
  user: AuthUser | null
}) {
  const [summary, setSummary] = useState<PlanSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteToken, setInviteToken] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getPlanSummary(authorizedFetch)
      setSummary(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar plano')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => { void load() }, [load])

  const handleRedeem = async () => {
    const trimmed = inviteToken.trim()
    if (trimmed.length < 8) {
      setRedeemMsg({ type: 'error', text: 'Token muito curto — confirme o que você colou.' })
      return
    }
    // Aceita tanto token puro quanto URL completa — extrai o último segmento.
    const token = trimmed.includes('/') ? trimmed.split('/').filter(Boolean).pop() ?? trimmed : trimmed
    setRedeeming(true)
    setRedeemMsg(null)
    try {
      await redeemProInvite(authorizedFetch, token)
      await refreshUser()
      await load()
      setInviteToken('')
      setRedeemMsg({ type: 'success', text: '✨ Você agora é PRO! Todos os limites foram liberados.' })
    } catch (err) {
      setRedeemMsg({ type: 'error', text: err instanceof Error ? err.message : 'Falha ao resgatar convite' })
    } finally {
      setRedeeming(false)
    }
  }

  const effectivePlan = user?.plan ?? 'FREE'
  const isPro = effectivePlan === 'PRO'

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-base font-bold text-[var(--text)]">Plano</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          Veja o seu tier atual, o quanto já usou de cada feature e como liberar mais recursos.
        </p>
      </header>

      {/* Card do tier atual */}
      <div className={`relative overflow-hidden rounded-xl border p-5 ${isPro ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-[var(--brand)]/10' : 'border-[var(--line)] bg-[var(--surface-hover)]'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown size={18} className={isPro ? 'text-amber-500' : 'text-[var(--muted)]'} />
            <span className="text-[15px] font-bold text-[var(--text)]">
              {isPro ? 'Plano PRO' : 'Plano grátis'}
            </span>
          </div>
          {isPro && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">
              Ativo
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
          {isPro
            ? 'Você tem acesso a todas as features sem limite.'
            : 'O plano grátis tem limites em algumas features. Faça upgrade pra PRO pra liberar tudo.'}
        </p>
      </div>

      {/* Uso / limites */}
      {loading && (
        <p className="text-[12px] text-[var(--muted)]">Carregando uso atual…</p>
      )}
      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-500">{error}</p>
      )}
      {summary && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Uso atual</p>
          <ul className="overflow-hidden rounded-xl border border-[var(--line)]">
            {(Object.keys(FEATURE_LABELS) as PlanFeatureKey[]).map((key, idx) => {
              const used = summary.usage[key]
              const limit = summary.limits[key]
              const unlimited = limit === null
              const atLimit = !unlimited && used >= limit
              return (
                <li
                  key={key}
                  className={`flex items-center justify-between gap-2 bg-[var(--surface)] px-4 py-3 ${idx < Object.keys(FEATURE_LABELS).length - 1 ? 'border-b border-[var(--line)]' : ''}`}
                >
                  <span className="text-[13px] text-[var(--text)]">{FEATURE_LABELS[key]}</span>
                  <span className={`text-[12px] font-bold tabular-nums ${atLimit ? 'text-rose-500' : 'text-[var(--muted)]'}`}>
                    {used}{unlimited ? ' / ∞' : ` / ${limit}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Convite — só pra free */}
      {!isPro && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
          <p className="text-[13px] font-bold text-[var(--text)]">Tem um convite?</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Cole o link completo ou só o token recebido pra fazer upgrade gratuito pro PRO.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              placeholder="abc123… ou link completo"
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
            />
            <button
              type="button"
              onClick={() => void handleRedeem()}
              disabled={redeeming || inviteToken.trim().length === 0}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
            >
              {redeeming ? 'Resgatando…' : 'Resgatar'}
            </button>
          </div>
          {redeemMsg && (
            <p
              className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
                redeemMsg.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500'
                  : 'border-rose-500/30 bg-rose-500/5 text-rose-500'
              }`}
            >
              {redeemMsg.text}
            </p>
          )}
        </div>
      )}

      {/* Benefícios PRO */}
      {!isPro && (
        <div className="rounded-xl border border-[var(--line)] p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-[var(--text)]">
            <Sparkles size={14} className="text-[var(--brand)]" />
            O que muda no PRO
          </p>
          <ul className="mt-2 space-y-1.5 text-[12px] text-[var(--muted)]">
            <li className="flex items-start gap-2">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              Gerações de IA <strong>ilimitadas</strong> (FREE = 3 totais)
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              <strong>Rotinas e exercícios sem limite</strong>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              Histórico de IA mais longo (50 gerações)
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              Mais exercícios fixados na Progress (até 20)
            </li>
          </ul>
          <p className="mt-3 text-[11px] italic text-[var(--muted)]">
            Em breve: plano PRO pago direto pelo app. Por enquanto, só com convite de admin.
          </p>
        </div>
      )}
    </div>
  )
}

