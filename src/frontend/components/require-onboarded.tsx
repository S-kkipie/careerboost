"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { Spinner } from "@/frontend/components/ui/spinner";
import { useProfile } from "@/frontend/hooks/api";
import { shouldRedirectToOnboarding } from "@/frontend/lib/onboarding";

// Guards the (app) group: a signed-in user without a profile has not finished
// onboarding, so send them to the wizard. Must be nested inside RequireSession
// (the profile query needs an authenticated session).
export function RequireOnboarded({ children }: { children: ReactNode }) {
    const profile = useProfile();
    const router = useRouter();
    const hasProfile = Boolean(profile.data?.profile);

    useEffect(() => {
        if (!profile.isPending && shouldRedirectToOnboarding(hasProfile)) {
            router.replace("/onboarding");
        }
    }, [profile.isPending, hasProfile, router]);

    if (profile.isPending || shouldRedirectToOnboarding(hasProfile)) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner className="size-8 text-primary" />
            </div>
        );
    }
    return <>{children}</>;
}
