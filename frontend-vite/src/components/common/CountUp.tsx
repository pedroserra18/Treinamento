import { useEffect, useRef, useState } from 'react'

type CountUpProps = {
  value: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
  formatter?: (n: number) => string
}

export function CountUp({
  value,
  duration = 700,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
  formatter,
}: CountUpProps) {
  const [display, setDisplay] = useState(0)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setDisplay(value)
      return
    }
    fromRef.current = display
    startRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const progress = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = fromRef.current + (value - fromRef.current) * eased
      setDisplay(next)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  const rendered = formatter
    ? formatter(display)
    : `${prefix}${display.toFixed(decimals)}${suffix}`

  return <span className={className}>{rendered}</span>
}
