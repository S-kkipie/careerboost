"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import { requestGmailAccess } from "@/frontend/auth/gmail";
import { RequireSession } from "@/frontend/components/require-session";
import { Button } from "@/frontend/components/ui/button";
import { Spinner } from "@/frontend/components/ui/spinner";
import {
    useMe,
    useProfile,
    useRunIngestion,
    useRunMatching,
    useUploadCv,
} from "@/frontend/hooks/api";
import { errorMessage } from "@/frontend/lib/format";

function OnboardingFlow() {
    const router = useRouter();
    const me = useMe();
    const profile = useProfile();
    const uploadCv = useUploadCv();
    const runIngestion = useRunIngestion();
    const runMatching = useRunMatching();

    const gmailConnected = me.data?.gmailConnected ?? false;
    const hasProfile = Boolean(profile.data?.profile);

    function onCvChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            uploadCv.mutate({ file });
        }
    }

    async function onGenerate() {
        await runMatching.mutateAsync();
        router.push("/feed");
    }

    return (
        <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
            <h1 className="font-bold text-2xl text-foreground">
                Configura tu cuenta
            </h1>

            <section className="rounded-lg border bg-card p-4">
                <h2 className="font-semibold text-foreground">
                    1. Conecta tu Gmail
                </h2>
                <p className="text-muted-foreground text-sm">
                    Leemos solo los correos de la bolsa de trabajo (acceso de
                    solo lectura).
                </p>
                {gmailConnected ? (
                    <p className="mt-2 text-success text-sm">Conectado ✓</p>
                ) : (
                    <Button
                        className="mt-2"
                        onClick={() => void requestGmailAccess()}
                    >
                        Conectar Gmail
                    </Button>
                )}
            </section>

            <section className="rounded-lg border bg-card p-4">
                <h2 className="font-semibold text-foreground">
                    2. Sube tu CV (PDF)
                </h2>
                <p className="text-muted-foreground text-sm">
                    Extraemos tu perfil profesional para personalizar tus
                    matches.
                </p>
                <label
                    htmlFor="cv-file"
                    className="mt-2 inline-flex cursor-pointer items-center gap-2"
                >
                    <input
                        id="cv-file"
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={onCvChange}
                        disabled={uploadCv.isPending}
                    />
                    <span className="inline-flex h-10 items-center rounded-md bg-secondary px-4 text-secondary-foreground text-sm">
                        {uploadCv.isPending ? "Procesando…" : "Elegir archivo"}
                    </span>
                    {uploadCv.isPending ? (
                        <Spinner className="text-primary" />
                    ) : null}
                </label>
                {hasProfile ? (
                    <p className="mt-2 text-success text-sm">CV procesado ✓</p>
                ) : null}
                {uploadCv.isError ? (
                    <p className="mt-2 text-destructive text-sm">
                        {errorMessage(uploadCv.error)}
                    </p>
                ) : null}
            </section>

            <section className="rounded-lg border bg-card p-4">
                <h2 className="font-semibold text-foreground">
                    3. Sincroniza y genera matches
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => runIngestion.mutate()}
                        disabled={!gmailConnected || runIngestion.isPending}
                    >
                        {runIngestion.isPending
                            ? "Sincronizando…"
                            : "Sincronizar correos"}
                    </Button>
                    <Button
                        onClick={() => void onGenerate()}
                        disabled={!hasProfile || runMatching.isPending}
                    >
                        {runMatching.isPending
                            ? "Generando…"
                            : "Generar matches"}
                    </Button>
                </div>
                {runIngestion.isError ? (
                    <p className="mt-2 text-destructive text-sm">
                        {errorMessage(runIngestion.error)}
                    </p>
                ) : null}
                {runMatching.isError ? (
                    <p className="mt-2 text-destructive text-sm">
                        {errorMessage(runMatching.error)}
                    </p>
                ) : null}
            </section>
        </main>
    );
}

export default function OnboardingPage() {
    return (
        <RequireSession>
            <OnboardingFlow />
        </RequireSession>
    );
}
