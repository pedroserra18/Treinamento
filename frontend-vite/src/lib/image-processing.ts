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

export async function optimizeImageFileToDataUrl(
  file: File,
  options?: { maxEdge?: number; quality?: number; maxOutputBytes?: number },
): Promise<string> {
  const sourceDataUrl = await readFileAsDataUrl(file)
  if (!sourceDataUrl) {
    throw new Error('Imagem invalida')
  }

  const image = await loadImage(sourceDataUrl)
  const maxEdge = options?.maxEdge ?? 1200
  const startQuality = options?.quality ?? 0.84
  const maxOutputBytes = options?.maxOutputBytes ?? 1_600_000
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return sourceDataUrl
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  let quality = Math.min(0.92, Math.max(0.5, startQuality))
  let output = canvas.toDataURL('image/jpeg', quality)

  const estimateBytes = (dataUrl: string): number => {
    const commaIndex = dataUrl.indexOf(',')
    if (commaIndex < 0) {
      return 0
    }

    const base64Length = dataUrl.length - commaIndex - 1
    return Math.floor(base64Length * 0.75)
  }

  while (estimateBytes(output) > maxOutputBytes && quality > 0.5) {
    quality = Math.max(0.5, quality - 0.08)
    output = canvas.toDataURL('image/jpeg', quality)
  }

  return output
}