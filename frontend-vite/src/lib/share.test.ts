import { describe, it, expect, vi, afterEach } from 'vitest'
import { shareLink } from './share'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shareLink', () => {
  it('usa a bandeja nativa quando disponível → "shared"', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    const result = await shareLink({ url: 'https://x/post/1', title: 't' })
    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
  })

  it('cancelar a bandeja (AbortError) não vira erro → "shared"', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError'))
    vi.stubGlobal('navigator', { share })
    expect(await shareLink({ url: 'u' })).toBe('shared')
  })

  it('sem share, cai no clipboard → "copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const result = await shareLink({ url: 'https://x/post/1' })
    expect(result).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://x/post/1')
  })

  it('clipboard falhando → "failed"', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('x')) } })
    expect(await shareLink({ url: 'u' })).toBe('failed')
  })
})
