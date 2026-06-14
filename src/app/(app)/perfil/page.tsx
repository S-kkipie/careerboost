"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/frontend/components/ui/button";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { useProfile, useUpdateProfile } from "@/frontend/hooks/api";
import { errorMessage } from "@/frontend/lib/format";

interface FormState {
    escuelaProfesional: string;
    grado: string;
    ubicacion: string;
    intereses: string;
    skills: string;
    experienciaResumen: string;
    expectativaSalarial: string;
}

const EMPTY: FormState = {
    escuelaProfesional: "",
    grado: "",
    ubicacion: "",
    intereses: "",
    skills: "",
    experienciaResumen: "",
    expectativaSalarial: "",
};

function toList(value: string): string[] {
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

interface FieldProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
}

function Field({ id, label, value, onChange, type = "text" }: FieldProps) {
    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className="font-medium text-foreground text-sm">
                {label}
            </label>
            <input
                id={id}
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-foreground text-sm"
            />
        </div>
    );
}

export default function PerfilPage() {
    const profileQuery = useProfile();
    const updateProfile = useUpdateProfile();
    const [form, setForm] = useState<FormState>(EMPTY);

    const profile = profileQuery.data?.profile ?? null;

    useEffect(() => {
        if (profile) {
            setForm({
                escuelaProfesional: profile.escuelaProfesional ?? "",
                grado: profile.grado ?? "",
                ubicacion: profile.ubicacion ?? "",
                intereses: (profile.intereses ?? []).join(", "),
                skills: (profile.skills ?? []).join(", "),
                experienciaResumen: profile.experienciaResumen ?? "",
                expectativaSalarial:
                    profile.expectativaSalarial === null ||
                    profile.expectativaSalarial === undefined
                        ? ""
                        : String(profile.expectativaSalarial),
            });
        }
    }, [profile]);

    function update(field: keyof FormState, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    function onSubmit(e: FormEvent) {
        e.preventDefault();
        const salarioTrim = form.expectativaSalarial.trim();
        let expectativaSalarial: number | null = null;
        if (salarioTrim !== "") {
            const n = Number(salarioTrim);
            expectativaSalarial = Number.isNaN(n) ? null : Math.round(n);
        }
        updateProfile.mutate({
            escuelaProfesional: form.escuelaProfesional,
            grado: form.grado,
            ubicacion: form.ubicacion,
            intereses: toList(form.intereses),
            skills: toList(form.skills),
            experienciaResumen: form.experienciaResumen,
            expectativaSalarial,
        });
    }

    if (profileQuery.isPending) {
        return <Skeleton className="h-96 w-full" />;
    }

    if (!profile) {
        return (
            <p className="text-muted-foreground text-sm">
                Aún no tienes un perfil. Sube tu CV en el onboarding.
            </p>
        );
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <h1 className="font-bold text-2xl text-foreground">Tu perfil</h1>

            <Field
                id="escuela"
                label="Escuela profesional"
                value={form.escuelaProfesional}
                onChange={(v) => update("escuelaProfesional", v)}
            />
            <Field
                id="grado"
                label="Grado"
                value={form.grado}
                onChange={(v) => update("grado", v)}
            />
            <Field
                id="ubicacion"
                label="Ubicación"
                value={form.ubicacion}
                onChange={(v) => update("ubicacion", v)}
            />
            <Field
                id="intereses"
                label="Intereses (separados por coma)"
                value={form.intereses}
                onChange={(v) => update("intereses", v)}
            />
            <Field
                id="skills"
                label="Habilidades (separadas por coma)"
                value={form.skills}
                onChange={(v) => update("skills", v)}
            />

            <div className="flex flex-col gap-1">
                <label
                    htmlFor="experiencia"
                    className="font-medium text-foreground text-sm"
                >
                    Resumen de experiencia
                </label>
                <textarea
                    id="experiencia"
                    value={form.experienciaResumen}
                    onChange={(e) =>
                        update("experienciaResumen", e.target.value)
                    }
                    rows={4}
                    className="rounded-md border bg-background px-3 py-2 text-foreground text-sm"
                />
            </div>

            <Field
                id="salario"
                label="Expectativa salarial (S/)"
                type="number"
                value={form.expectativaSalarial}
                onChange={(v) => update("expectativaSalarial", v)}
            />

            <div className="flex items-center gap-3">
                <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? "Guardando…" : "Guardar cambios"}
                </Button>
                {updateProfile.isSuccess ? (
                    <span className="text-success text-sm">Guardado ✓</span>
                ) : null}
                {updateProfile.isError ? (
                    <span className="text-destructive text-sm">
                        {errorMessage(updateProfile.error)}
                    </span>
                ) : null}
            </div>
        </form>
    );
}
