import type { PostComment } from '../services/socialService'

// Cache em memória dos comentários por post. Evita o spinner "carregando" e o
// round-trip a cada vez que o usuário abre/fecha os comentários — abrir de novo
// mostra na hora (stale-while-revalidate: exibe o cache e revalida em
// background). Só em memória (não persiste); some no reload, o que é ok.
const cache = new Map<string, PostComment[]>()

export function peekComments(postId: string): PostComment[] | null {
  return cache.get(postId) ?? null
}

export function setCommentsCache(postId: string, items: PostComment[]): void {
  cache.set(postId, items)
}
