import Link from "next/link";

import { Auth } from "@/frontend/components/auth/auth";

export default async function AuthPage({
    params,
}: {
    params: Promise<{ pathname: string }>;
}) {
    const { pathname } = await params;

    return (
        <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12">
            {/* Sillar dot-grid motif */}
            <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="sillar-grid absolute inset-0 opacity-40" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,var(--color-brand)_0%,transparent_55%)] opacity-[0.06]" />
            </div>

            <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
                <Link
                    href="/"
                    className="font-serif text-2xl font-bold tracking-tight text-foreground"
                >
                    Career<span className="text-brand">Boost</span>
                </Link>

                <h1 className="font-serif text-3xl font-bold leading-tight text-foreground">
                    Tu bolsa UNSA,{" "}
                    <span className="text-brand italic">sin ruido</span>
                </h1>
                <p className="-mt-2 text-muted-foreground">
                    Entra con tu cuenta Google para ver tus matches.
                </p>

                <div className="w-full">
                    <Auth path={pathname} />
                </div>

                <p className="text-xs text-muted-foreground">
                    Acceso solo-lectura · UNSA · IA personalizada
                </p>

                <Link
                    href="/"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                    ← Volver al inicio
                </Link>
            </div>
        </main>
    );
}
