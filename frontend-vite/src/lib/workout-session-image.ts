const STORAGE_PREFIX = 'acad:workout-session-image:'

function getStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Falha ao ler imagem'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Falha ao processar imagem'))
    image.src = dataUrl
  })
}

async function optimizeImage(file: File): Promise<string> {
  const sourceDataUrl = await readFileAsDataUrl(file)
  if (!sourceDataUrl) {
    throw new Error('Imagem invalida')
  }

  const image = await loadImage(sourceDataUrl)
  const maxEdge = 1200
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return sourceDataUrl
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.84)
}

export async function saveWorkoutSessionImage(sessionId: string, file: File): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }

  const optimizedDataUrl = await optimizeImage(file)

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