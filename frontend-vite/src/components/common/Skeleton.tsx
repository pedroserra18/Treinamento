type SkeletonProps = {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-xl bg-[var(--surface-hover)] ${className}`} />
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  )
}

export function SkeletonExerciseRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3 animate-pulse">
      <div className="h-12 w-12 shrink-0 rounded-lg bg-[var(--surface-hover)]" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-2 animate-pulse">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  )
}
