"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { PropsWithChildren, ReactNode } from "react";
import { authClient } from "@/frontend/auth/auth";
import { AuthProvider as AuthUIProvider } from "@/frontend/components/auth/auth-provider";
import { ErrorBoundary } from "@/frontend/components/error-boundary";
import { Toaster } from "@/frontend/components/ui/sonner";
import { TooltipProvider } from "@/frontend/components/ui/tooltip";
import { apiClient, EdenProvider } from "@/frontend/lib/eden";
import { spanishLocalization } from "@/frontend/lib/localization";
import { getQueryClient } from "@/frontend/lib/query-client";
import { ThemeProvider } from "./theme-provider";

function AuthLink({
    href,
    className,
    children,
}: {
    href: string;
    className?: string;
    children?: ReactNode;
}) {
    return (
        <NextLink href={href} className={className}>
            {children}
        </NextLink>
    );
}

export default function Providers({ children }: PropsWithChildren) {
    const queryClient = getQueryClient();
    const router = useRouter();

    return (
        <ThemeProvider attribute="class" disableTransitionOnChange>
            <ErrorBoundary>
                <NuqsAdapter>
                    <QueryClientProvider client={queryClient}>
                        <EdenProvider
                            client={apiClient}
                            queryClient={queryClient}
                        >
                            <TooltipProvider>
                                <Toaster richColors position="top-center" />
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
                                    Link={AuthLink}
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
