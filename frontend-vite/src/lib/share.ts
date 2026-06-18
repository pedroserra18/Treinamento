// Compartilhamento "estilo app grande": abre a bandeja nativa do sistema
// (navigator.share → WhatsApp, Instagram, Stories, etc.) quando disponível,
// com fallback pra copiar o link no clipboard. Devolve o que aconteceu pra
// quem chamou decidir o feedback (toast) — assim a lógica fica num lugar só.
export type ShareResult = 'shared' | 'copied' | 'failed'

export async function shareLink(data: { url: string; title?: string; text?: string }): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: data.title, text: data.text, url: data.url })
      return 'shared'
    } catch (err) {
      // Usuário fechou/cancelou a bandeja nativa → NÃO é erro, não mostra nada.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared'
      // Qualquer outra falha: cai pro clipboard abaixo.
    }
  }
  try {
    await navigator.clipboard.writeText(data.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
