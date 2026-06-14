import type { ComponentProps } from "react";
import { cn } from "@/frontend/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
    ghost: "bg-transparent text-foreground hover:bg-accent",
    destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
};

// Shared so anchors styled as buttons (e.g. external "Postular" links and nav
// Links) can reuse the exact look without nesting <button> inside <a>.
export function buttonClasses(
    variant: ButtonVariant = "primary",
    size: ButtonSize = "md",
): string {
    return cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
    );
}

interface ButtonProps extends ComponentProps<"button"> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

export function Button({
    variant = "primary",
    size = "md",
    className,
    type = "button",
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={cn(buttonClasses(variant, size), className)}
            {...props}
        />
    );
}
