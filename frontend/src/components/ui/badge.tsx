import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}
