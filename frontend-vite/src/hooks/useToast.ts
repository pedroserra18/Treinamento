import { useEffect, useState } from 'react'

// Estado + auto-dismiss de um toast de 1 mensagem. Pareado com o componente
// <Toast> (components/common/Toast). Separado do componente pra satisfazer o
// react-refresh (arquivo de componente exporta só componentes).
export function useToast(timeoutMs = 2200) {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), timeoutMs)
    return () => window.clearTimeout(id)
  }, [toast, timeoutMs])
  return { toast, showToast: setToast }
}
