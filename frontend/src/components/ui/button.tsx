import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[#2563eb] bg-[#2563eb] px-4 py-2 text-white hover:bg-[#1d4ed8] hover:border-[#1d4ed8] focus-visible:ring-[var(--ring)]",
        secondary:
          "border-[#d6dde6] bg-white px-4 py-2 text-[var(--foreground)] hover:bg-[#f8fafc] focus-visible:ring-[var(--ring)]",
        ghost:
          "border-transparent px-3 py-2 text-[var(--muted-foreground)] hover:bg-[#f3f6fa] hover:text-[var(--foreground)] focus-visible:ring-[var(--ring)]",
        danger:
          "border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-[#b91c1c] hover:bg-[#fee2e2] focus-visible:ring-[rgba(220,38,38,0.18)]",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
