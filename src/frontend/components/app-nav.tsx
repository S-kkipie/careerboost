"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@/frontend/components/auth/user/user-button";
import { ThemeToggle } from "@/frontend/components/theme-toggle";
import { cn } from "@/frontend/lib/utils";

const navLinks = [
    { href: "/feed", label: "Feed" },
    { href: "/bandeja", label: "Bandeja" },
    { href: "/digest", label: "Tu digest" },
];

export function AppNav() {
    const pathname = usePathname();

    return (
        <header className="border-b bg-card">
            <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
                <Link
                    href="/feed"
                    className="font-serif font-bold text-foreground"
                >
                    Career<span className="text-brand">Boost</span>
                </Link>
                <div className="flex items-center gap-1">
                    {navLinks.map((link) => {
                        const active = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                    active
                                        ? "text-brand-strong"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
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
