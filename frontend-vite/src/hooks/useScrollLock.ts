import { useEffect } from 'react'

// Trava o scroll vertical do body/html enquanto modais/sheets estão
// abertos. Usa um CONTADOR global de locks ativos em vez de cada hook
// salvar/restaurar o overflow independentemente — esse padrão antigo
// dependia de cleanups rodarem em ordem LIFO, o que quebra quando dois
// locks aninhados (ex.: CreateExerciseModal + ConfirmDialog dentro dele)
// desaparecem no mesmo commit + um navigate() na mesma tick. Resultado
// era a tela ficar travada após navegar saindo do dialog.
//
// Com contador:
//   • Primeiro lock: salva o overflow original e seta hidden.
//   • Locks subsequentes: incrementam contador, não tocam estilo.
//   • Cleanup: decrementa; quando bate 0, restaura o overflow original.
// Ordem dos cleanups vira irrelevante porque a restauração só acontece
// quando o último lock sai.

let lockCount = 0
let savedHtmlOverflow = ''
let savedBodyOverflow = ''
let savedBodyPaddingRight = ''

function acquireLock(): void {
  if (lockCount === 0) {
    const html = document.documentElement
    const body = document.body
    savedHtmlOverflow = html.style.overflow
    savedBodyOverflow = body.style.overflow
    savedBodyPaddingRight = body.style.paddingRight

    const scrollbarWidth = window.innerWidth - html.clientWidth
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
  }
  lockCount += 1
}

function releaseLock(): void {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.documentElement.style.overflow = savedHtmlOverflow
    document.body.style.overflow = savedBodyOverflow
    document.body.style.paddingRight = savedBodyPaddingRight
  }
}

export function useScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return
    acquireLock()
    return () => { releaseLock() }
  }, [active])
}
