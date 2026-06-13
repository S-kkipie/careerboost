import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "@/frontend/providers/providers";
import "./globals.css";

export const metadata: Metadata = { title: "CareerBoost" };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
