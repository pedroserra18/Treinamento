// Client-side mirror of the API's handle rules (`api/src/shared/utils/handle.ts`).
// Duplicated rather than imported so the frontend bundle doesn't reach into the
// backend; kept tiny and reviewed together when one changes.

export const HANDLE_REGEX = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/
export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 30

// Returns a user-facing error message, or null when the handle is valid.
// `null` for empty input (callers decide whether to show "obrigatório").
export function validateHandle(raw: string): string | null {
  const h = raw.trim().toLowerCase()
  if (h.length === 0) return null
  if (h.length < HANDLE_MIN_LENGTH) return `Handle precisa de pelo menos ${HANDLE_MIN_LENGTH} caracteres.`
  if (h.length > HANDLE_MAX_LENGTH) return `Handle deve ter no máximo ${HANDLE_MAX_LENGTH} caracteres.`
  if (!HANDLE_REGEX.test(h)) {
    return 'Use letras minúsculas, números, ".", "_" ou "-" (sem começar ou terminar com separador).'
  }
  return null
}

// Strips characters the API would refuse so the input field never accepts
// something the server will throw on. Lowercases as you type to match the
// stored form.
export function sanitiseHandleInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, HANDLE_MAX_LENGTH)
}
