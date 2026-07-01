// SHA-256 hex digest of a data URL's binary payload. Used by competition
// entries to make sure the proof photo is fresh — the backend rejects
// any entry whose hash matches one the user already posted in the same
// competition.

export async function sha256OfDataUrl(dataUrl: string): Promise<string> {
  const commaIdx = dataUrl.indexOf(',')
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const view = new Uint8Array(digest)
  let out = ''
  for (let i = 0; i < view.length; i += 1) {
    out += view[i].toString(16).padStart(2, '0')
  }
  return out
}
