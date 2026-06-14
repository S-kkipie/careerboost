"use client";

import Link from "next/link";
import { UserButton } from "@/frontend/components/auth/user/user-button";
import { ThemeToggle } from "@/frontend/components/theme-toggle";
import { buttonVariants } from "@/frontend/components/ui/button";

export function AppNav() {
    return (
        <header className="border-b bg-card">
            <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
                <Link href="/feed" className="font-semibold text-foreground">
                    CareerBoost
                </Link>
                <div className="flex items-center gap-1">
                    <Link
                        href="/feed"
                        className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                        })}
                    >
                        Feed
                    </Link>
                    <Link
                        href="/digest"
                        className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                        })}
                    >
                        Tu digest
                    </Link>
                    <ThemeToggle />
                    <UserButton
                        size="icon"
                        links={[
                            { label: "Tu perfil", href: "/perfil" },
                            { label: "Tu digest", href: "/digest" },
                        ]}
                    />
                </div>
            </nav>
        </header>
    );
}
