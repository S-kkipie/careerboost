"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";

interface SyncCtaProps {
    onSync: () => void;
}

export function SyncCta({ onSync }: SyncCtaProps) {
    return (
        <Empty>
            <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-brand/10 text-brand">
                    <Sparkles aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle className="font-serif">
                    Sincroniza tu bolsa de trabajo
                </EmptyTitle>
                <EmptyDescription>
                    Escaneamos los correos de la bolsa, filtramos el ruido con
                    IA y generamos tus mejores matches.
                </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <Button type="button" size="lg" onClick={onSync}>
                    <Sparkles aria-hidden="true" />
                    Sincronizar mi bolsa
                </Button>
            </EmptyContent>
        </Empty>
    );
}
