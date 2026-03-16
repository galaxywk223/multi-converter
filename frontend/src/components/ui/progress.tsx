import { cn } from "../../lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-white/6", className)}>
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-strong))] transition-all duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
