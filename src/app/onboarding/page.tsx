"use client";

import {
    CheckCircle2,
    FileText,
    Mail,
    Sparkles,
    UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import { useEffect } from "react";
import { toast } from "sonner";

import { requestGmailAccess } from "@/frontend/auth/gmail";
import { StepCard } from "@/frontend/components/onboarding/step-card";
import { Stepper } from "@/frontend/components/onboarding/stepper";
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
import { cn } from "@/frontend/lib/utils";

function OnboardingFlow() {
    const router = useRouter();
    const me = useMe();
    const profile = useProfile();
    const uploadCv = useUploadCv();
    const runIngestion = useRunIngestion();
    const runMatching = useRunMatching();

    const gmailConnected = me.data?.gmailConnected ?? false;
    const hasProfile = Boolean(profile.data?.profile);

    // Toast errors for each mutation
    useEffect(() => {
        if (uploadCv.isError) {
            toast.error(errorMessage(uploadCv.error));
        }
    }, [uploadCv.isError, uploadCv.error]);

    useEffect(() => {
        if (runIngestion.isError) {
            toast.error(errorMessage(runIngestion.error));
        }
    }, [runIngestion.isError, runIngestion.error]);

    useEffect(() => {
        if (runMatching.isError) {
            toast.error(errorMessage(runMatching.error));
        }
    }, [runMatching.isError, runMatching.error]);

    function onCvChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            e.target.value = "";
            uploadCv.mutate({ file });
        }
    }

    async function onGenerate() {
        try {
            await runMatching.mutateAsync();
            router.push("/feed");
        } catch {
            // runMatching.error already shown via toast
        }
    }

    // Derive step states for the progress indicator
    const step1State = gmailConnected ? "completed" : "active";
    const step2State = gmailConnected
        ? hasProfile
            ? "completed"
            : "active"
        : "upcoming";
    const step3State = gmailConnected && hasProfile ? "active" : "upcoming";

    return (
        <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
            {/* Header + progress indicator */}
            <div className="text-center space-y-6">
                <h1 className="font-bold text-2xl text-foreground">
                    Configura tu cuenta
                </h1>
                <Stepper
                    steps={[
                        { label: "Conexión", state: step1State },
                        { label: "Perfil", state: step2State },
                        { label: "Matches", state: step3State },
                    ]}
                />
            </div>

            <div className="flex flex-col gap-4">
                {/* Step 1 — Connect Gmail */}
                <StepCard
                    state={step1State}
                    icon={<Mail className="size-6" />}
                    title="Conecta tu Gmail"
                    description="Leemos solo los correos de la bolsa de trabajo (acceso de solo lectura)."
                >
                    {gmailConnected ? (
                        <span className="inline-flex items-center gap-1.5 text-success text-sm font-medium">
                            <CheckCircle2 className="size-4" />
                            Conectado ✓
                        </span>
                    ) : (
                        <Button
                            type="button"
                            onClick={() => void requestGmailAccess()}
                        >
                            Conectar Gmail
                        </Button>
                    )}
                </StepCard>

                {/* Step 2 — Upload CV */}
                <StepCard
                    state={step2State}
                    icon={<FileText className="size-6" />}
                    title="Sube tu CV (PDF)"
                    description="Extraemos tu perfil profesional para personalizar tus matches."
                >
                    {hasProfile ? (
                        <span className="inline-flex items-center gap-1.5 text-success text-sm font-medium">
                            <CheckCircle2 className="size-4" />
                            CV procesado ✓
                        </span>
                    ) : (
                        <label
                            htmlFor="cv-file"
                            className={cn(
                                "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors",
                                uploadCv.isPending
                                    ? "cursor-not-allowed opacity-60"
                                    : "cursor-pointer hover:border-primary hover:bg-primary/5",
                            )}
                        >
                            <input
                                id="cv-file"
                                type="file"
                                accept="application/pdf"
                                className="hidden"
                                onChange={onCvChange}
                                disabled={uploadCv.isPending}
                            />
                            {uploadCv.isPending ? (
                                <>
                                    <Spinner className="size-8 text-primary" />
                                    <p className="text-sm font-semibold text-primary animate-pulse">
                                        Procesando…
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Nuestra IA está extrayendo tus
                                        habilidades.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <UploadCloud className="size-10 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">
                                        Arrastra tu archivo aquí o
                                    </p>
                                    <span className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent">
                                        Elegir archivo
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                        Solo archivos PDF (máx. 5 MB)
                                    </p>
                                </>
                            )}
                        </label>
                    )}
                </StepCard>

                {/* Step 3 — Sync & generate matches */}
                <StepCard
                    state={step3State}
                    icon={<Sparkles className="size-6" />}
                    title="Sincroniza y genera matches"
                    description="Sincroniza tus correos y deja que la IA encuentre las mejores ofertas para ti."
                >
                    <div className="flex flex-wrap gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => runIngestion.mutate()}
                            disabled={!gmailConnected || runIngestion.isPending}
                        >
                            {runIngestion.isPending ? (
                                <>
                                    <Spinner />
                                    Sincronizando…
                                </>
                            ) : (
                                "Sincronizar correos"
                            )}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void onGenerate()}
                            disabled={!hasProfile || runMatching.isPending}
                        >
                            {runMatching.isPending ? (
                                <>
                                    <Spinner />
                                    Generando…
                                </>
                            ) : (
                                "Generar matches"
                            )}
                        </Button>
                    </div>
                </StepCard>
            </div>
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
