export function LandingFooter() {
    return (
        <footer className="w-full border-t border-border bg-muted px-5 py-12 md:px-12">
            <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 text-center">
                <div className="text-lg font-bold text-foreground">
                    CareerBoost UNSA
                </div>
                <div className="flex flex-wrap justify-center gap-6">
                    <span className="text-sm text-muted-foreground">
                        Protección de datos
                    </span>
                    <span className="text-sm text-muted-foreground">
                        Términos
                    </span>
                    <span className="text-sm text-muted-foreground">
                        Contacto
                    </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground opacity-75">
                    © 2026 CareerBoost UNSA · Acceso Gmail solo-lectura.
                </p>
            </div>
        </footer>
    );
}
