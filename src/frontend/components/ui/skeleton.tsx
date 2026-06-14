import { cn } from "@/frontend/lib/utils";

export function Skeleton({ className }: { className?: string }) {
    return (
        <div className={cn("animate-pulse rounded-md bg-muted", className)} />
    );
}
