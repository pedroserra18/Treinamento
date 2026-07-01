import { optimizeImageFileToDataUrl } from '../image/image-processing'

const STORAGE_PREFIX = 'acad:workout-session-image:'

function getStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

export async function saveWorkoutSessionImage(sessionId: string, file: File): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }

  const optimizedDataUrl = await optimizeImageFileToDataUrl(file, {
    maxEdge: 1200,
    quality: 0.84,
    maxOutputBytes: 1_200_000,
  })

  try {
    window.localStorage.setItem(getStorageKey(sessionId), optimizedDataUrl)
  } catch {
    throw new Error('Nao foi possivel salvar a imagem localmente no navegador')
  }
}

export function getStoredWorkoutSessionImage(sessionId: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage.getItem(getStorageKey(sessionId))
  } catch {
    return null
  }
}