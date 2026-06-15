"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@/frontend/components/auth/user/user-button";
import { ThemeToggle } from "@/frontend/components/theme-toggle";
import { usePendingCount } from "@/frontend/hooks/api";
import { cn } from "@/frontend/lib/utils";

const navLinks = [
    { href: "/feed", label: "Feed" },
    { href: "/guardados", label: "Guardados" },
    { href: "/bandeja", label: "Bandeja" },
    { href: "/digest", label: "Tu digest" },
];

export function AppNav() {
    const pathname = usePathname();
    const pending = usePendingCount();
    const count = pending.data?.count ?? 0;

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
                        const showBadge = link.href === "/bandeja" && count > 0;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                    active
                                        ? "text-brand-strong"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {link.label}
                                {showBadge ? (
                                    <span
                                        role="img"
                                        aria-label={`${count} correos sin sincronizar`}
                                        className="inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 font-semibold text-[10px] text-brand-foreground tabular-nums"
                                    >
                                        {count > 9 ? "9+" : count}
                                    </span>
                                ) : null}
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
