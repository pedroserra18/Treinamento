import { describe, it, expect } from 'vitest'
import { notificationLink } from './notificationService'

describe('notificationLink', () => {
  it('like/comentário/denúncia levam ao post (com fallback /feed)', () => {
    expect(notificationLink({ type: 'POST_LIKE', metadata: { postId: 'p1' } })).toBe('/post/p1')
    expect(notificationLink({ type: 'POST_COMMENT', metadata: { postId: 'p2' } })).toBe('/post/p2')
    expect(notificationLink({ type: 'POST_REPORTED', metadata: { postId: 'p3' } })).toBe('/post/p3')
    expect(notificationLink({ type: 'POST_LIKE', metadata: {} })).toBe('/feed')
  })

  it('desafios levam à competição / convite', () => {
    expect(notificationLink({ type: 'COMPETITION_STARTED', metadata: { competitionId: 'c1' } })).toBe('/desafios/c1')
    expect(notificationLink({ type: 'COMPETITION_RANKING_OVERTAKEN', metadata: { competitionId: 'c2' } })).toBe('/desafios/c2')
    expect(notificationLink({ type: 'COMPETITION_INVITE_RECEIVED', metadata: { inviteToken: 't1' } })).toBe('/desafios/convite/t1')
  })

  it('seguidor → perfil, removido por admin → /profile, desconhecido → null', () => {
    expect(notificationLink({ type: 'USER_FOLLOWED', metadata: { followerUserId: 'u1' } })).toBe('/u/u1')
    expect(notificationLink({ type: 'POST_REMOVED_BY_ADMIN', metadata: {} })).toBe('/profile')
    expect(notificationLink({ type: 'TIPO_DESCONHECIDO', metadata: null })).toBeNull()
  })
})
