import type { ReactNode } from "react";
import { AppNav } from "@/frontend/components/app-nav";
import { RequireOnboarded } from "@/frontend/components/require-onboarded";
import { RequireSession } from "@/frontend/components/require-session";

export default function AppLayout({ children }: { children: ReactNode }) {
    return (
        <RequireSession>
            <RequireOnboarded>
                <AppNav />
                <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
            </RequireOnboarded>
        </RequireSession>
    );
}
