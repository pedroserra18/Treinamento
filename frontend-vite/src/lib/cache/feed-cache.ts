import { getFeed, type FeedPost } from '../../services/socialService'
import { createApiCache } from './api-cache'

// Cache da primeira página do feed social.
//
// TTL 30s — feed muda quando alguém posta, comenta, curte. Janela curta
// pra refletir interações rápidas. Mesmo com TTL baixo, peek() ainda
// resolve em <1ms e mostra dados imediatos no mount; refetch em background
// traz updates.
//
// NÃO persiste em localStorage. Feed pode ter fotos pesadas e o user
// não espera ver feed "antigo" de horas atrás ao reabrir — mostra o que
// é fresco ou skeleton se rede demorar.

export const feedFirstPageCache = createApiCache<FeedPost[]>({
  ttlMs: 30 * 1000,
  storageKey: null,
  fetcher: getFeed,
})
