"use client";

import { FileText, UploadCloud } from "lucide-react";
import { type ChangeEvent, useEffect } from "react";
import { toast } from "sonner";
import { Spinner } from "@/frontend/components/ui/spinner";
import { useUploadCv } from "@/frontend/hooks/api";
import { errorMessage } from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

export function UploadCvStep() {
    const uploadCv = useUploadCv();

    useEffect(() => {
        if (uploadCv.isError) {
            toast.error(errorMessage(uploadCv.error));
        }
    }, [uploadCv.isError, uploadCv.error]);

    function onCvChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            e.target.value = "";
            uploadCv.mutate({ file });
        }
    }

    return (
        <div className="flex flex-col items-center gap-6 text-center">
            <div className="rounded-2xl bg-brand/10 p-4 text-brand">
                <FileText className="size-8" />
            </div>
            <div className="space-y-2">
                <h2 className="font-serif font-bold text-2xl text-foreground">
                    Sube tu CV (PDF)
                </h2>
                <p className="text-muted-foreground text-sm">
                    Extraemos tu perfil profesional para personalizar tus
                    matches.
                </p>
            </div>
            <label
                htmlFor="cv-file"
                className={cn(
                    "flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors",
                    uploadCv.isPending
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer hover:border-brand hover:bg-brand/5",
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
                        <p className="animate-pulse font-semibold text-primary text-sm">
                            Procesando…
                        </p>
                        <p className="text-muted-foreground text-xs">
                            Nuestra IA está extrayendo tus habilidades.
                        </p>
                    </>
                ) : (
                    <>
                        <UploadCloud className="size-10 text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">
                            Arrastra tu archivo aquí o
                        </p>
                        <span className="inline-flex h-9 items-center rounded-md border bg-background px-4 font-medium text-sm shadow-xs hover:bg-accent">
                            Elegir archivo
                        </span>
                        <p className="text-muted-foreground text-xs">
                            Solo archivos PDF (máx. 5 MB)
                        </p>
                    </>
                )}
            </label>
        </div>
    );
}
