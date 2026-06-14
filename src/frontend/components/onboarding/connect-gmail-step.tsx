"use client";

import { Mail } from "lucide-react";
import { requestGmailAccess } from "@/frontend/auth/gmail";
import { Button } from "@/frontend/components/ui/button";

export function ConnectGmailStep() {
    return (
        <div className="flex flex-col items-center gap-6 text-center">
            <div className="rounded-2xl bg-brand/10 p-4 text-brand">
                <Mail className="size-8" />
            </div>
            <div className="space-y-2">
                <h2 className="font-serif font-bold text-2xl text-foreground">
                    Conecta tu Gmail
                </h2>
                <p className="text-muted-foreground text-sm">
                    Leemos solo los correos de la bolsa de trabajo (acceso de
                    solo lectura). Nunca escribimos ni borramos nada.
                </p>
            </div>
            <Button
                type="button"
                size="lg"
                onClick={() => void requestGmailAccess()}
            >
                Conectar Gmail
            </Button>
        </div>
    );
}
