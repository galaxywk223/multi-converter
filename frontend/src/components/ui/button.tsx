import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full border text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-[var(--accent)] px-4 py-2 text-[var(--accent-foreground)] shadow-lg shadow-[color:rgba(236,110,52,0.25)] hover:-translate-y-0.5 hover:bg-[var(--accent-strong)] focus-visible:ring-[var(--ring)]",
        secondary:
          "border-white/12 bg-white/5 px-4 py-2 text-[var(--foreground)] hover:border-white/20 hover:bg-white/10 focus-visible:ring-[var(--ring)]",
        ghost:
          "border-transparent px-3 py-2 text-[var(--muted-foreground)] hover:bg-white/6 hover:text-[var(--foreground)] focus-visible:ring-[var(--ring)]",
        danger:
          "border-transparent bg-[rgba(204,69,73,0.18)] px-4 py-2 text-[var(--danger)] hover:bg-[rgba(204,69,73,0.28)] focus-visible:ring-[var(--danger)]",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-11 px-4",
        lg: "h-12 px-5 text-sm",
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
