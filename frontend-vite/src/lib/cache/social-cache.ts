import { getFollowers, getFollowing, type UserSearchResult } from '../../services/socialService'
import { createApiCache } from './api-cache'

// Caches de seguidores e seguindo do user logado.
//
// TTL 5 min — relações sociais mudam com baixa frequência (alguém te
// segue, você segue alguém — algumas vezes por dia no máximo). Invalidar
// explicitamente nos pontos onde o user faz follow/unfollow garante
// consistência imediata sem esperar TTL.
//
// Persistido em localStorage pra reload do app mostrar a lista
// instantânea — especialmente útil pros painéis "Quem te segue" /
// "Quem você segue" no ProfilePage que abrem em popover.

export const followersCache = createApiCache<UserSearchResult[]>({
  ttlMs: 5 * 60 * 1000,
  storageKey: 'acad:followers-cache:v1',
  fetcher: getFollowers,
})

export const followingCache = createApiCache<UserSearchResult[]>({
  ttlMs: 5 * 60 * 1000,
  storageKey: 'acad:following-cache:v1',
  fetcher: getFollowing,
})
