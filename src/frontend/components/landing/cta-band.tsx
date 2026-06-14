import Link from "next/link";
import { buttonVariants } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

export function CtaBand() {
    return (
        <section className="bg-primary text-primary-foreground py-16 px-5 md:px-12">
            <div className="mx-auto max-w-[1100px] space-y-4 text-center">
                <h2 className="text-3xl font-semibold">
                    ¿Listo para impulsar tu carrera?
                </h2>
                <p className="mx-auto max-w-2xl text-lg text-primary-foreground/80">
                    Únete a la comunidad de la UNSA y descubre oportunidades
                    diseñadas para tu perfil.
                </p>
                <div className="pt-6">
                    <Link
                        href="/auth/sign-in"
                        className={cn(
                            buttonVariants({
                                variant: "secondary",
                                size: "lg",
                            }),
                            "px-10 py-4 text-base shadow-lg",
                        )}
                    >
                        Empezar ahora
                    </Link>
                </div>
            </div>
        </section>
    );
}
