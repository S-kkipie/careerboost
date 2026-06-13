export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { configureLogging } = await import("@/server/logging");
        await configureLogging();
    }
}
