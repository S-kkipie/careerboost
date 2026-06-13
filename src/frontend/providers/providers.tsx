"use client";

import { AuthProvider as AuthUIProvider } from "@better-auth-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { PropsWithChildren } from "react";
import { authClient } from "@/frontend/auth/auth";
import { ErrorBoundary } from "@/frontend/components/error-boundary";
import { TooltipProvider } from "@/frontend/components/ui/tooltip";
import { apiClient, EdenProvider } from "@/frontend/lib/eden";
import { spanishLocalization } from "@/frontend/lib/localization";
import { getQueryClient } from "@/frontend/lib/query-client";
import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: PropsWithChildren) {
    const queryClient = getQueryClient();
    const router = useRouter();

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <ErrorBoundary>
                <NuqsAdapter>
                    <QueryClientProvider client={queryClient}>
                        <EdenProvider
                            client={apiClient}
                            queryClient={queryClient}
                        >
                            <TooltipProvider>
                                <AuthUIProvider
                                    authClient={authClient}
                                    redirectTo="/onboarding"
                                    socialProviders={["google"]}
                                    emailAndPassword={{
                                        enabled: false,
                                        forgotPassword: false,
                                    }}
                                    navigate={({ to, replace }) =>
                                        replace
                                            ? router.replace(to)
                                            : router.push(to)
                                    }
                                    localization={spanishLocalization}
                                    queryClient={queryClient}
                                >
                                    {children}
                                </AuthUIProvider>
                            </TooltipProvider>
                        </EdenProvider>
                    </QueryClientProvider>
                </NuqsAdapter>
            </ErrorBoundary>
        </ThemeProvider>
    );
}
