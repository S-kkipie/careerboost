import { Eye, ShieldCheck, Sparkles } from "lucide-react";

import { Auth } from "@/frontend/components/auth/auth";

export default async function AuthPage({
    params,
}: {
    params: Promise<{ pathname: string }>;
}) {
    const { pathname } = await params;

    return (
        <main className="grid min-h-screen lg:grid-cols-2">
            {/* LEFT: brand panel */}
            <aside className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
                <div>
                    {/* Wordmark */}
                    <p className="text-2xl font-bold tracking-tight">
                        CareerBoost
                    </p>
                </div>

                <div className="space-y-6">
                    {/* Main headline */}
                    <h1 className="text-4xl font-extrabold leading-tight">
                        Tu bolsa de trabajo UNSA, sin ruido
                    </h1>

                    {/* Trust bullets */}
                    <ul className="space-y-4 text-primary-foreground/80">
                        <li className="flex items-start gap-3">
                            <ShieldCheck
                                className="mt-0.5 h-5 w-5 shrink-0"
                                aria-hidden="true"
                            />
                            <span>
                                Gmail solo-lectura — nunca enviamos correos por
                                ti
                            </span>
                        </li>
                        <li className="flex items-start gap-3">
                            <Eye
                                className="mt-0.5 h-5 w-5 shrink-0"
                                aria-hidden="true"
                            />
                            <span>
                                Salario siempre visible — sin sorpresas al final
                                del proceso
                            </span>
                        </li>
                        <li className="flex items-start gap-3">
                            <Sparkles
                                className="mt-0.5 h-5 w-5 shrink-0"
                                aria-hidden="true"
                            />
                            <span>
                                Matches personalizados según tu perfil UNSA
                            </span>
                        </li>
                    </ul>
                </div>

                {/* Bottom UNSA mark */}
                <div>
                    <p className="text-sm font-medium text-primary-foreground/60">
                        Universidad Nacional de San Agustín &mdash; UNSA
                    </p>
                </div>
            </aside>

            {/* RIGHT: auth card slot */}
            <section className="flex items-center justify-center p-6">
                <Auth path={pathname} />
            </section>
        </main>
    );
}
