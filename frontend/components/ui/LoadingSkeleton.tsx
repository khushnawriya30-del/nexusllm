"use client";

export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-bg-tertiary ${className}`}
      aria-hidden
    />
  );
}

export function ProviderCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <div className="flex items-center gap-3">
        <LoadingSkeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <LoadingSkeleton className="h-4 w-32" />
          <LoadingSkeleton className="h-3 w-48" />
        </div>
      </div>
    </div>
  );
}
