type SkeletonProps = {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`shimmer rounded-xl ${className}`} />
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
    <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3">
      <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-2">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  )
}

export function SkeletonPostCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-col md:flex-row">
        <div className="flex shrink-0 items-center justify-center p-4 md:w-[32%] md:max-w-[300px]">
          <Skeleton className="aspect-square w-full max-w-[240px] rounded-full" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
