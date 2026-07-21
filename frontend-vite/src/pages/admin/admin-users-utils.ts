// Helpers puros, tipos de filtro e constantes de rótulo extraídos da
// AdminUsersPage. Sem estado nem React — só transformam dados. Ficam aqui pra
// reduzir o tamanho da página e poderem ser testados isoladamente.

export const PAGE_SIZE = 20

export type Role = 'USER' | 'COACH' | 'ADMIN'
export type StatusFilter = '' | 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DISABLED'
export type RoleFilter = '' | Role
export type OnbFilter = '' | 'completed' | 'pending'
export type PlanFilter = '' | 'FREE' | 'PRO'
export type SortOrder = 'asc' | 'desc'

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}

export function formatTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function relativeTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays <= 0) {
    const diffHours = Math.floor(diffMs / 3_600_000)
    if (diffHours <= 0) return 'agora há pouco'
    return `há ${diffHours}h`
  }
  if (diffDays === 1) return 'há 1 dia'
  return `há ${diffDays} dias`
}

export function initials(name: string | null, email: string): string {
  const source = (name ?? email).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #ff7a5e, #c63a1f)',
  'linear-gradient(135deg, #6aa6ff, #1d4fa3)',
  'linear-gradient(135deg, #6fd2a3, #1f7a45)',
  'linear-gradient(135deg, #f3c66a, #8a6308)',
  'linear-gradient(135deg, #d4a3ff, #6e2db5)',
]

export function avatarGradient(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

// Rótulos amigáveis para ações registradas no EventLog.
export const EVENT_LABELS: Record<string, string> = {
  admin_user_deactivated: 'Conta desativada',
  admin_user_reactivated: 'Conta reativada',
  admin_user_deleted: 'Conta excluída',
  admin_user_role_changed: 'Acesso alterado',
  admin_user_plan_changed: 'Assinatura alterada',
}

export const EXPERIENCE_LABELS: Record<string, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
}
export const GOAL_LABELS: Record<string, string> = {
  STRENGTH: 'Força',
  HYPERTROPHY: 'Hipertrofia',
  WEIGHT_LOSS: 'Emagrecimento',
  ENDURANCE: 'Resistência',
  GENERAL_FITNESS: 'Saúde geral',
}

// Progresso do onboarding = quantos dos 6 campos do quiz foram preenchidos.
// `sex` é excluído porque tem default OTHER (nunca é nulo → não sinaliza nada).
export function onboardingProgress(u: {
  birthDate: string | null
  availableDaysPerWeek: number | null
  heightCm: number | null
  weightKg: number | null
  experienceLevel: string | null
  primaryGoal: string | null
}): { filled: number; total: number } {
  const fields = [u.birthDate, u.availableDaysPerWeek, u.heightCm, u.weightKg, u.experienceLevel, u.primaryGoal]
  return { filled: fields.filter((v) => v !== null && v !== undefined).length, total: fields.length }
}

// Quais campos do onboarding ainda faltam (pra mostrar no detalhe). Útil pra
// contas antigas que "completaram" o fluxo velho mas não têm os campos novos.
export function onboardingMissing(u: {
  birthDate: string | null
  availableDaysPerWeek: number | null
  heightCm: number | null
  weightKg: number | null
  experienceLevel: string | null
  primaryGoal: string | null
}): string[] {
  const map: [unknown, string][] = [
    [u.birthDate, 'Nascimento'],
    [u.availableDaysPerWeek, 'Dias/semana'],
    [u.heightCm, 'Altura'],
    [u.weightKg, 'Peso'],
    [u.experienceLevel, 'Experiência'],
    [u.primaryGoal, 'Objetivo'],
  ]
  return map.filter(([v]) => v === null || v === undefined).map(([, label]) => label)
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  // Escapa se tiver vírgula, aspas, quebra de linha ou ; (separador comum no Excel BR).
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(headers: string[], rows: (string | number | null)[][], filename: string): void {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','))
  // BOM faz o Excel abrir UTF-8 corretamente (acentos).
  const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Pill/status tones (mapas de classe Tailwind, dados puros) ────────────────

export type PillTone = 'real' | 'test' | 'active' | 'pending' | 'suspended' | 'disabled' | 'admin' | 'user' | 'coach' | 'pro' | 'free'

export const PILL_TONES: Record<PillTone, string> = {
  real: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  test: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  pending: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  suspended: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
  disabled: 'bg-[var(--surface-hover)] text-[var(--muted)] border-[var(--line)]',
  admin: 'bg-[var(--text)] text-[var(--surface)] border-[var(--text)]',
  user: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  coach: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30',
  pro: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  free: 'bg-[var(--surface-hover)] text-[var(--muted)] border-[var(--line)]',
}

export const STATUS_META: Record<string, { label: string; tone: PillTone; dot: string }> = {
  ACTIVE: { label: 'Ativo', tone: 'active', dot: 'bg-emerald-500' },
  PENDING: { label: 'Pendente', tone: 'pending', dot: 'bg-amber-500' },
  SUSPENDED: { label: 'Suspenso', tone: 'suspended', dot: 'bg-orange-500' },
  DISABLED: { label: 'Desativado', tone: 'disabled', dot: 'bg-[var(--muted)]' },
}

export function roleTone(role: string): PillTone {
  return role === 'ADMIN' ? 'admin' : role === 'COACH' ? 'coach' : 'user'
}
