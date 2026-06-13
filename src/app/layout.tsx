import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "CareerBoost" };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body>{children}</body>
        </html>
    );
}
