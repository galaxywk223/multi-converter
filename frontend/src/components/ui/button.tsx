import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-white hover:border-[var(--accent-strong)] hover:bg-[var(--accent-strong)] focus-visible:ring-[var(--ring)]",
        secondary:
          "border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] hover:bg-[#f7f8fa] focus-visible:ring-[var(--ring)]",
        ghost:
          "border-transparent px-3 py-2 text-[var(--muted-foreground)] hover:bg-[#eef1f5] hover:text-[var(--foreground)] focus-visible:ring-[var(--ring)]",
        danger:
          "border-[#f2c7c7] bg-[#fff3f3] px-3 py-2 text-[#b42318] hover:bg-[#fee7e7] focus-visible:ring-[rgba(220,38,38,0.18)]",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-9 px-3",
        lg: "h-10 px-4 text-sm",
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
