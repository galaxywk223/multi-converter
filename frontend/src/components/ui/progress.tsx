import { cn } from "../../lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-[#e7ebf0]", className)}>
      <div
        className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
