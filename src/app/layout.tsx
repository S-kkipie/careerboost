import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";
import Providers from "@/frontend/providers/providers";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
    weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
    subsets: ["latin"],
    variable: "--font-fraunces",
    display: "swap",
    weight: ["600", "700"],
    style: ["normal", "italic"],
});

export const metadata: Metadata = { title: "CareerBoost" };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body
                className={`${inter.variable} ${fraunces.variable} font-sans`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
