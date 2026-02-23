interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <Skeleton className="h-5 w-3/4 mb-3" />
      <Skeleton className="h-4 w-1/2 mb-2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      {/* Header row */}
      <div className="flex gap-1 mb-2">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-10" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-1 mb-1">
          <Skeleton className="h-8 w-32" />
          {Array.from({ length: 8 }).map((_, j) => (
            <Skeleton key={j} className="h-8 w-10" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-1/3 mb-2" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-[var(--color-border)] p-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}
