"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { Button } from "@/frontend/components/ui/button";
import { Spinner } from "@/frontend/components/ui/spinner";
import { useProfile } from "@/frontend/hooks/api";
import { shouldRedirectToOnboarding } from "@/frontend/lib/onboarding";

// Guards the (app) group: a signed-in user without a profile has not finished
// onboarding, so send them to the wizard. Must be nested inside RequireSession
// (the profile query needs an authenticated session). A profile *fetch error*
// is not the same as "no profile" — never redirect on error, offer a retry so a
// transient failure can't lock an onboarded user out of the app.
export function RequireOnboarded({ children }: { children: ReactNode }) {
    const profile = useProfile();
    const router = useRouter();
    const hasProfile = Boolean(profile.data?.profile);
    const shouldRedirect =
        !profile.isPending &&
        !profile.isError &&
        shouldRedirectToOnboarding(hasProfile);

    useEffect(() => {
        if (shouldRedirect) {
            router.replace("/onboarding");
        }
    }, [shouldRedirect, router]);

    if (profile.isError) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
                <p className="text-destructive text-sm">
                    No pudimos verificar tu perfil. Revisa tu conexión e
                    inténtalo de nuevo.
                </p>
                <Button type="button" onClick={() => void profile.refetch()}>
                    Reintentar
                </Button>
            </div>
        );
    }

    if (profile.isPending || shouldRedirect) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner className="size-8 text-primary" />
            </div>
        );
    }
    return <>{children}</>;
}
