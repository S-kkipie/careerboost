import { configure, getConsoleSink } from "@logtape/logtape";

let configured = false;

export async function configureLogging() {
    if (configured) return;
    configured = true;
    await configure({
        reset: true,
        sinks: { console: getConsoleSink() },
        loggers: [
            { category: ["server"], sinks: ["console"], lowestLevel: "info" },
            {
                category: ["logtape", "meta"],
                sinks: ["console"],
                lowestLevel: "warning",
            },
        ],
    });
}
