"use client";

import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings } from "@/frontend/components/auth/settings/settings";
import { ChipsInput } from "@/frontend/components/profile/chips-input";
import { Button } from "@/frontend/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/frontend/components/ui/tabs";
import { Textarea } from "@/frontend/components/ui/textarea";
import { useProfile, useUpdateProfile } from "@/frontend/hooks/api";
import { errorMessage } from "@/frontend/lib/format";

interface FormState {
    escuelaProfesional: string;
    grado: string;
    ubicacion: string;
    skills: string[];
    intereses: string[];
    experienciaResumen: string;
    expectativaSalarial: string;
}

const EMPTY: FormState = {
    escuelaProfesional: "",
    grado: "",
    ubicacion: "",
    skills: [],
    intereses: [],
    experienciaResumen: "",
    expectativaSalarial: "",
};

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
                skills: profile.skills ?? [],
                intereses: profile.intereses ?? [],
                experienciaResumen: profile.experienciaResumen ?? "",
                expectativaSalarial:
                    profile.expectativaSalarial === null ||
                    profile.expectativaSalarial === undefined
                        ? ""
                        : String(profile.expectativaSalarial),
            });
        }
    }, [profile]);

    useEffect(() => {
        if (updateProfile.isSuccess) {
            toast.success("Perfil guardado");
        }
    }, [updateProfile.isSuccess]);

    useEffect(() => {
        if (updateProfile.isError) {
            toast.error(errorMessage(updateProfile.error));
        }
    }, [updateProfile.isError, updateProfile.error]);

    function update<K extends keyof FormState>(field: K, value: FormState[K]) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    function onSubmit(e: FormEvent<HTMLFormElement>) {
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
            intereses: form.intereses,
            skills: form.skills,
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
        <Tabs defaultValue="perfil" className="w-full gap-4">
            <TabsList>
                <TabsTrigger value="perfil">Perfil profesional</TabsTrigger>
                <TabsTrigger value="cuenta">Cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="perfil" tabIndex={-1}>
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Académico</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="escuela">
                                    Escuela profesional
                                </Label>
                                <Input
                                    id="escuela"
                                    value={form.escuelaProfesional}
                                    onChange={(e) =>
                                        update(
                                            "escuelaProfesional",
                                            e.target.value,
                                        )
                                    }
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="grado">Grado</Label>
                                <Input
                                    id="grado"
                                    value={form.grado}
                                    onChange={(e) =>
                                        update("grado", e.target.value)
                                    }
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="ubicacion">Ubicación</Label>
                                <Input
                                    id="ubicacion"
                                    value={form.ubicacion}
                                    onChange={(e) =>
                                        update("ubicacion", e.target.value)
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Profesional</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="skills">Habilidades</Label>
                                <ChipsInput
                                    id="skills"
                                    value={form.skills}
                                    onChange={(next) => update("skills", next)}
                                    placeholder="Escribe una habilidad y presiona Enter o coma"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="intereses">Intereses</Label>
                                <ChipsInput
                                    id="intereses"
                                    value={form.intereses}
                                    onChange={(next) =>
                                        update("intereses", next)
                                    }
                                    placeholder="Escribe un interés y presiona Enter o coma"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="experiencia">
                                    Resumen de experiencia
                                </Label>
                                <Textarea
                                    id="experiencia"
                                    value={form.experienciaResumen}
                                    onChange={(e) =>
                                        update(
                                            "experienciaResumen",
                                            e.target.value,
                                        )
                                    }
                                    rows={4}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Preferencias</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="salario">
                                    Expectativa salarial (S/)
                                </Label>
                                <Input
                                    id="salario"
                                    type="number"
                                    value={form.expectativaSalarial}
                                    onChange={(e) =>
                                        update(
                                            "expectativaSalarial",
                                            e.target.value,
                                        )
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center gap-3">
                        <Button
                            type="submit"
                            disabled={updateProfile.isPending}
                        >
                            {updateProfile.isPending
                                ? "Guardando…"
                                : "Guardar cambios"}
                        </Button>
                    </div>
                </form>
            </TabsContent>

            <TabsContent value="cuenta" tabIndex={-1}>
                <Settings view="account" />
            </TabsContent>
        </Tabs>
    );
}
