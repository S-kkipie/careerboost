"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/frontend/auth/auth";
import { CtaBand } from "@/frontend/components/landing/cta-band";
import { Hero } from "@/frontend/components/landing/hero";
import { HowItWorks } from "@/frontend/components/landing/how-it-works";
import { ImpactBand } from "@/frontend/components/landing/impact-band";
import { LandingFooter } from "@/frontend/components/landing/landing-footer";
import { LandingNav } from "@/frontend/components/landing/landing-nav";
import { Spinner } from "@/frontend/components/ui/spinner";

export default function Home() {
    const { data: session, isPending } = authClient.useSession();
    const router = useRouter();

    useEffect(() => {
        if (!isPending && session) {
            router.replace("/feed");
        }
    }, [isPending, session, router]);

    if (isPending || session) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner className="size-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <LandingNav />
            <main className="pt-16">
                <Hero />
                <ImpactBand />
                <HowItWorks />
                <CtaBand />
            </main>
            <LandingFooter />
        </div>
    );
}
