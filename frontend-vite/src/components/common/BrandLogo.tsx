import logo from '../../assets/Logo_sem_Fundo.png'

type BrandLogoProps = {
  className?: string
  compact?: boolean
}

export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  if (compact) {
    return (
      <img
        src={logo}
        alt="SerraAthlo"
        className={className ?? 'h-10 w-auto object-contain'}
      />
    )
  }

  return (
    <div className={className ?? 'flex items-center gap-3'}>
      <img src={logo} alt="SerraAthlo" className="h-11 w-auto object-contain" />
      <div className="hidden sm:block">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-400">Performance Lab</p>
        <p className="text-sm font-extrabold text-[var(--text)]">SerraAthlo</p>
      </div>
    </div>
  )
}
