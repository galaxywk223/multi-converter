import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[#d6dde6] bg-[#f8fafc] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}
