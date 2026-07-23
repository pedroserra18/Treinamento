import type { FeedPost, WorkoutSet } from '../../services/socialService'

// Helpers puros, paletas e formatadores extraídos do FeedPostCard. Sem React —
// só transformam dados (datas, volume, iniciais/cor de avatar, pills de músculo,
// tipo de série). Ficam aqui pra reduzir o god-file e poderem ser testados
// isoladamente.

export const CARDIO_PT: Record<string, string> = {
  WALK: 'Caminhada', RUN: 'Corrida', BIKE: 'Bicicleta', STAIRS: 'Escada',
  ELLIPTICAL: 'Elíptico', ROW: 'Remo', JUMP_ROPE: 'Corda', SWIM: 'Natação', OTHER: 'Cardio',
}

export function formatCardioChip(c: { type: string; durationSec: number; distanceMeters: number | null }): string {
  const min = `${Math.round(c.durationSec / 60)} min`
  const km = c.distanceMeters ? ` · ${(c.distanceMeters / 1000).toFixed(2).replace(/\.?0+$/, '')} km` : ''
  return `${min}${km}`
}

// ─── Formatters ────────────────────────────────────────────────────────────

export function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

// Volume in "tonnes" when ≥ 1000kg matches the design's "3.2 t" look,
// kg under that, em dash for cardio/bodyweight sessions where it's 0/null.
export function formatVolume(kg: number | null | undefined): string {
  if (kg == null || kg <= 0) return '—'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`
  return `${Math.round(kg)} kg`
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return d === 1 ? 'ontem' : `${d}d atrás`
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

export function formatHHMM(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Stable avatar colour from the user id. Picking from a curated palette keeps
// contrast against white text predictable; the hash ensures the same user
// always lands on the same hue.
export const AVATAR_COLORS = [
  '#E13A1A', '#5B7CFF', '#1F8A5B', '#A855F7', '#F59E0B',
  '#06B6D4', '#EC4899', '#14B8A6', '#FF6B35', '#7A5AE0',
]
export function avatarColorFromId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function avatarInitials(name: string | null, handle: string): string {
  const source = name?.trim() || handle
  return source.split(/\s+/).map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'
}

// `Você` = own post; `Amigo` = following the author; null = stranger (chip hidden).
export function getRelLabel(isOwn: boolean, isFriend: boolean): string | null {
  if (isOwn) return 'Você'
  if (isFriend) return 'Amigo'
  return null
}

// Stable label for the workout type ("Push · Peito & Tríceps").
export function getSplitLabel(post: FeedPost): string {
  if (post.caption?.trim()) {
    const firstLine = post.caption.split('\n')[0]?.trim()
    if (firstLine && firstLine.length <= 60) return firstLine
  }
  const groups = post.workoutSummary?.exercises
    .map(e => e.primaryMuscleGroup)
    .filter(Boolean)
  if (!groups || groups.length === 0) return 'Treino'
  const unique = Array.from(new Set(groups)).slice(0, 3)
  return unique.join(' · ')
}

// ─── Muscle pill palette (shared with WorkoutSessionCard etc.) ────────────

export const MUSCLE_PILL: Record<string, { bg: string; fg: string }> = {
  ABDOMEN:  { bg: '#fff1cc', fg: '#8a5a00' },
  ABDOMINAL:{ bg: '#fff1cc', fg: '#8a5a00' },
  CORE:     { bg: '#d6f3df', fg: '#1b6b3a' },
  BACK:     { bg: '#dbe7ff', fg: '#1c3d8f' },
  COSTAS:   { bg: '#dbe7ff', fg: '#1c3d8f' },
  CHEST:    { bg: '#ffe1d6', fg: '#8a3a18' },
  PEITO:    { bg: '#ffe1d6', fg: '#8a3a18' },
  LEGS:     { bg: '#e8dcff', fg: '#3a1c8f' },
  PERNAS:   { bg: '#e8dcff', fg: '#3a1c8f' },
  GLUTES:   { bg: '#fde2f0', fg: '#7a1c52' },
  SHOULDERS:{ bg: '#fff3d6', fg: '#7a5a00' },
  OMBROS:   { bg: '#fff3d6', fg: '#7a5a00' },
  BICEPS:   { bg: '#d6f3f0', fg: '#1b5a6b' },
  TRICEPS:  { bg: '#d6e8f3', fg: '#1b4a6b' },
  ARMS:     { bg: '#d6f3f0', fg: '#1b5a6b' },
  BRACOS:   { bg: '#d6f3f0', fg: '#1b5a6b' },
}

export function musclePillStyle(group: string): { bg: string; fg: string } {
  const key = group.toUpperCase().replace(/[^A-Z]/g, '')
  return MUSCLE_PILL[key] ?? { bg: 'var(--surface-hover)', fg: 'var(--muted)' }
}

export type SetKind = 'duration' | 'distance' | 'reps'

export function detectSetKind(set: WorkoutSet): SetKind {
  if (set.durationSec != null && set.durationSec > 0) return 'duration'
  if (set.distanceMeters != null && set.distanceMeters > 0) return 'distance'
  return 'reps'
}

export function setMagnitude(set: WorkoutSet, kind: SetKind): number {
  if (kind === 'duration') return set.durationSec ?? 0
  if (kind === 'distance') return set.distanceMeters ?? 0
  const reps = set.reps ?? 0
  const w = set.weightKg ?? 0
  return w > 0 ? w * reps : reps
}

export function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
