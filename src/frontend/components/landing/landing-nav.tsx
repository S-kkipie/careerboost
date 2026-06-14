import { Moon } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

export function LandingNav() {
    return (
        <nav className="fixed top-0 left-0 z-50 w-full flex items-center justify-between border-b border-border bg-background/90 backdrop-blur-md px-5 md:px-12 h-16">
            <span className="text-xl font-bold text-primary">CareerBoost</span>
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cambiar tema"
                    className="text-muted-foreground hover:text-foreground"
                >
                    <Moon className="size-5" />
                </Button>
                <Link
                    href="/auth/sign-in"
                    className={cn(
                        buttonVariants({ variant: "default", size: "default" }),
                    )}
                >
                    Entrar
                </Link>
            </div>
        </nav>
    );
}
