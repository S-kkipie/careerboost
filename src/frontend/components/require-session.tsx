"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { authClient } from "@/frontend/auth/auth";
import { Spinner } from "@/frontend/components/ui/spinner";

export function RequireSession({ children }: { children: ReactNode }) {
    const { data: session, isPending } = authClient.useSession();
    const router = useRouter();

    useEffect(() => {
        if (!isPending && !session) {
            router.replace("/");
        }
    }, [isPending, session, router]);

    if (isPending || !session) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner className="size-8 text-primary" />
            </div>
        );
    }
    return <>{children}</>;
}
