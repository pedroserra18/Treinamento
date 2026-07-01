import { describe, it, expect } from 'vitest'
import { PERF_MARKER, parsePerfPayload, stripPerfMarker, serializePerfNotes } from './perf-notes'

describe('perf-notes', () => {
  it('serializa e faz round-trip do payload', () => {
    const note = serializePerfNotes('Nota do user', { sets: 2, series: [{ reps: 10, setType: 'drop' }] })
    expect(note).toContain(PERF_MARKER)
    expect(stripPerfMarker(note)).toBe('Nota do user')
    const parsed = parsePerfPayload(note)
    expect(parsed?.series?.[0]?.reps).toBe(10)
    expect(parsed?.series?.[0]?.setType).toBe('drop')
    expect(parsed?.sets).toBe(2)
  })

  it('stripPerfMarker sem marcador devolve a nota trimada (e "" pra null)', () => {
    expect(stripPerfMarker('  só uma nota  ')).toBe('só uma nota')
    expect(stripPerfMarker(null)).toBe('')
    expect(stripPerfMarker(undefined)).toBe('')
  })

  it('parsePerfPayload devolve null sem marcador ou com JSON inválido', () => {
    expect(parsePerfPayload('nota simples')).toBeNull()
    expect(parsePerfPayload(null)).toBeNull()
    expect(parsePerfPayload(`x ${PERF_MARKER}{json quebrado`)).toBeNull()
  })

  it('serializa sem nota do usuário (não deixa espaço sobrando)', () => {
    const note = serializePerfNotes('', { sets: 1, series: [{ reps: 5 }] })
    expect(note.startsWith(PERF_MARKER)).toBe(true)
  })
})
