// Persistence layer for the "active workout" so the user can leave /train
// without losing the in-progress session. The mini bar reads the same key
// to surface the running workout from any page.
//
// On hydration the timer is forwarded by `now - lastSavedAt` when the
// workout was running, so closing the tab and re-opening keeps the clock
// accurate. The shape is versioned — when it changes, just bump the key
// suffix and let old payloads be dropped silently.

export type StoredCardioEntry = {
  type: string
  durationSec: number
  distanceMeters?: number
  notes?: string
}

// Mirrors ActiveExercise in TrainPage. Kept as `unknown`-shaped JSON to
// avoid a circular type dependency; TrainPage casts it back.
export type StoredActiveExercise = unknown

export type ActiveWorkoutSnapshot = {
  version: 1
  screen: 'ACTIVE' | 'SUMMARY'
  originMode: 'EMPTY' | 'ROUTINE'
  activePlanId: string
  activePlanName: string
  activeExercises: StoredActiveExercise[]
  cardioEntries: StoredCardioEntry[]
  startedAt: string | null
  endedAt: string | null
  elapsedSec: number
  isWorkoutRunning: boolean
  lastSavedAt: string
  currentExerciseName: string | null
}

const STORAGE_KEY = 'acad:active-workout:v1'

// Custom event so the same tab gets notified about writes (the native
// `storage` event only fires for *other* tabs). Keeps the mini bar in
// sync without the consumer having to poll.
const CHANGE_EVENT = 'acad:active-workout:changed'
export const ACTIVE_WORKOUT_DISCARD_EVENT = 'acad:active-workout:discard-request'

export function readActiveWorkout(): ActiveWorkoutSnapshot | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ActiveWorkoutSnapshot
    if (parsed.version !== 1) return null
    return parsed
  } catch {
    return null
  }
}

export function writeActiveWorkout(snapshot: Omit<ActiveWorkoutSnapshot, 'version' | 'lastSavedAt'>): void {
  try {
    const payload: ActiveWorkoutSnapshot = {
      ...snapshot,
      version: 1,
      lastSavedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // localStorage can throw (quota, private mode); the user just loses
    // the resume-across-pages perk in that case, not the running workout.
  }
}

export function clearActiveWorkout(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // ignore — same reason as writeActiveWorkout above
  }
}

export function subscribeActiveWorkout(listener: () => void): () => void {
  const handler = () => listener()
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

// Returns the wall-clock elapsed seconds, advancing for time spent away
// from the tab when the workout was running. Falls back to the stored
// elapsedSec when paused.
export function deriveElapsedSec(snapshot: ActiveWorkoutSnapshot, nowMs: number = Date.now()): number {
  if (!snapshot.isWorkoutRunning) return snapshot.elapsedSec
  const last = new Date(snapshot.lastSavedAt).getTime()
  if (!Number.isFinite(last)) return snapshot.elapsedSec
  const drift = Math.max(0, Math.floor((nowMs - last) / 1000))
  return snapshot.elapsedSec + drift
}
