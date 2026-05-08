import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[#f7f8fa] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}
