import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";

export function Hero() {
    return (
        <section className="relative flex min-h-[716px] flex-col items-center justify-center overflow-hidden px-5 py-16 md:px-12 text-center">
            {/* Subtle background decoration */}
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,var(--color-primary)_0%,transparent_60%)]" />
            </div>

            <div className="mx-auto w-full max-w-[1100px] space-y-4">
                <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl md:leading-tight">
                    Tu bolsa de trabajo UNSA,{" "}
                    <span className="text-primary">sin ruido</span>
                </h1>
                <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                    Recibe oportunidades laborales personalizadas con
                    transparencia salarial directamente desde tu Gmail{"·"}
                    <span className="font-medium">(acceso solo-lectura)</span>.
                </p>
                <div className="pt-6">
                    <Link
                        href="/auth/sign-in"
                        className={cn(
                            buttonVariants({ size: "lg" }),
                            "gap-3 px-8 py-4 text-base",
                        )}
                    >
                        <Image
                            src="https://www.google.com/favicon.ico"
                            alt="Google"
                            className="size-5 rounded-sm"
                            width={20}
                            height={20}
                            unoptimized
                        />
                        Continuar con Google
                    </Link>
                </div>
            </div>
        </section>
    );
}
