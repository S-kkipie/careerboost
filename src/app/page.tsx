"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/frontend/auth/auth";
import { Button } from "@/frontend/components/ui/button";
import { Spinner } from "@/frontend/components/ui/spinner";

export default function Home() {
    const { data: session, isPending } = authClient.useSession();
    const router = useRouter();

    useEffect(() => {
        if (!isPending && session) {
            router.replace("/feed");
        }
    }, [isPending, session, router]);

    function handleLogin() {
        void authClient.signIn.social({
            provider: "google",
            callbackURL: "/onboarding",
        });
    }

    if (isPending || session) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner className="size-8 text-primary" />
            </div>
        );
    }

    return (
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
            <h1 className="font-bold text-4xl text-foreground">CareerBoost</h1>
            <p className="text-lg text-muted-foreground">
                Empleos que hacen match con tu perfil profesional. Sin ruido,
                con claridad salarial, desde tu correo institucional.
            </p>
            <Button size="md" onClick={handleLogin}>
                Continuar con Google
            </Button>
        </main>
    );
}
