"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ConnectGmailStep } from "@/frontend/components/onboarding/connect-gmail-step";
import { type Step, Stepper } from "@/frontend/components/onboarding/stepper";
import { UploadCvStep } from "@/frontend/components/onboarding/upload-cv-step";
import { Card, CardContent } from "@/frontend/components/ui/card";
import { Spinner } from "@/frontend/components/ui/spinner";
import { useMe, useProfile } from "@/frontend/hooks/api";
import { shouldRedirectToFeed } from "@/frontend/lib/onboarding";

export function OnboardingWizard() {
    const router = useRouter();
    const me = useMe();
    const profile = useProfile();

    const isPending = me.isPending || profile.isPending;
    const gmailConnected = me.data?.gmailConnected ?? false;
    const hasProfile = Boolean(profile.data?.profile);

    // Onboarding is complete once a profile exists — redirect and never re-show.
    useEffect(() => {
        if (!isPending && shouldRedirectToFeed(hasProfile)) {
            router.replace("/feed");
        }
    }, [isPending, hasProfile, router]);

    if (isPending || hasProfile) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Spinner className="size-8 text-primary" />
            </div>
        );
    }

    const steps: Step[] = [
        { label: "Conexión", state: gmailConnected ? "completed" : "active" },
        { label: "Perfil", state: gmailConnected ? "active" : "upcoming" },
    ];

    return (
        <main className="mx-auto flex max-w-md flex-col gap-8 px-4 py-12">
            <Stepper steps={steps} />
            <Card>
                <CardContent className="pt-6">
                    {gmailConnected ? <UploadCvStep /> : <ConnectGmailStep />}
                </CardContent>
            </Card>
        </main>
    );
}
