"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/frontend/auth/auth";
import { Button, buttonClasses } from "@/frontend/components/ui/button";

export function AppNav() {
    const router = useRouter();

    async function handleSignOut() {
        try {
            await authClient.signOut();
        } catch {
            // best-effort; redirect regardless of backend result
        }
        router.replace("/");
    }

    return (
        <header className="border-b bg-card">
            <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
                <Link href="/feed" className="font-semibold text-foreground">
                    CareerBoost
                </Link>
                <div className="flex items-center gap-1">
                    <Link href="/feed" className={buttonClasses("ghost", "sm")}>
                        Feed
                    </Link>
                    <Link
                        href="/digest"
                        className={buttonClasses("ghost", "sm")}
                    >
                        Digest
                    </Link>
                    <Link
                        href="/perfil"
                        className={buttonClasses("ghost", "sm")}
                    >
                        Perfil
                    </Link>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleSignOut()}
                    >
                        Cerrar sesión
                    </Button>
                </div>
            </nav>
        </header>
    );
}
