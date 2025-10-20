import React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "destructive_outline";

type ButtonSize = "default" | "sm" | "lg" | "icon";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary text-white shadow hover:bg-primary/90",
  secondary:
    "bg-panel-secondary text-text-main border border-border hover:bg-panel-secondary/80",
  outline:
    "border border-border bg-transparent text-text-main hover:bg-panel-secondary/70",
  ghost: "bg-transparent text-text-main hover:bg-panel-secondary/60",
  destructive: "bg-red-500 text-white shadow hover:bg-red-600",
  destructive_outline:
    "border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-8 px-3 text-xs",
  lg: "h-12 px-6 text-base",
  icon: "h-9 w-9 p-0",
};

function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

