import "./load-env";

import { eq } from "drizzle-orm";
import { embedText } from "@/server/ai/embed";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { ingestionRuns } from "@/server/drizzle/schemas/ingestion-runs";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { profiles } from "@/server/drizzle/schemas/profiles";
import { computeDedupeHash } from "@/server/services/dedupe";
import { buildJobEmbeddingText } from "@/server/services/ingestion";
import { runMatching } from "@/server/services/matching";
import { buildProfileEmbeddingText } from "@/server/services/profile";

const SEED_WEEK_DATE = "2026-06-10";

interface DemoJob {
    titulo: string;
    empresa: string;
    modalidad: string;
    ubicacion: string | null;
    salarioMin: number | null;
    salarioMax: number | null;
    moneda: string | null;
    salarioPeriodo: string | null;
    salarioExplicito: boolean;
    requisitos: string;
    skills: string[];
    applyLink: string;
}

const DEMO_PROFILE = {
    escuelaProfesional: "Ingeniería de Sistemas",
    grado: "egresado",
    ubicacion: "Arequipa",
    skills: ["JavaScript", "TypeScript", "React", "Node.js", "SQL", "Python"],
    experienciaResumen:
        "Egresado de Ingeniería de Sistemas con prácticas en desarrollo web full-stack y bases de datos.",
    intereses: ["desarrollo web", "backend", "datos"],
    expectativaSalarial: 3000,
};

const DEMO_JOBS: DemoJob[] = [
    {
        titulo: "Desarrollador Backend Node.js",
        empresa: "TechAQP",
        modalidad: "remoto",
        ubicacion: null,
        salarioMin: 3500,
        salarioMax: 4500,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos:
            "Node.js, TypeScript, PostgreSQL, APIs REST. 1+ año de experiencia.",
        skills: ["Node.js", "TypeScript", "PostgreSQL"],
        applyLink: "https://empleos.example/backend-node",
    },
    {
        titulo: "Frontend Developer React",
        empresa: "Innova Labs",
        modalidad: "hibrido",
        ubicacion: "Arequipa",
        salarioMin: 3000,
        salarioMax: 3800,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "React, TypeScript, CSS. Portafolio requerido.",
        skills: ["React", "TypeScript", "CSS"],
        applyLink: "https://empleos.example/frontend-react",
    },
    {
        titulo: "Analista de Datos Junior",
        empresa: "DataPeru",
        modalidad: "presencial",
        ubicacion: "Arequipa",
        salarioMin: 2800,
        salarioMax: null,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "SQL, Python, Power BI. Egresado de carreras afines.",
        skills: ["SQL", "Python", "Power BI"],
        applyLink: "https://empleos.example/data-junior",
    },
    {
        titulo: "Practicante de Desarrollo Web",
        empresa: "StartupX",
        modalidad: "remoto",
        ubicacion: null,
        salarioMin: 1200,
        salarioMax: null,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "HTML, CSS, JavaScript. Ganas de aprender.",
        skills: ["JavaScript", "HTML", "CSS"],
        applyLink: "https://empleos.example/practicante-web",
    },
    {
        titulo: "Ingeniero de Software Full-Stack",
        empresa: "Consultora Andina",
        modalidad: "hibrido",
        ubicacion: "Arequipa",
        salarioMin: 4000,
        salarioMax: 5500,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "React, Node.js, SQL, Git. 2+ años.",
        skills: ["React", "Node.js", "SQL"],
        applyLink: "https://empleos.example/fullstack",
    },
    {
        titulo: "Soporte Técnico TI",
        empresa: "ServiTec",
        modalidad: "presencial",
        ubicacion: "Arequipa",
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Conocimiento de redes y hardware. Atención al cliente.",
        skills: ["Redes", "Hardware"],
        applyLink: "https://empleos.example/soporte-ti",
    },
    {
        titulo: "Desarrollador Python (ETL)",
        empresa: "FinData",
        modalidad: "remoto",
        ubicacion: null,
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Python, pandas, SQL. Procesos ETL.",
        skills: ["Python", "SQL"],
        applyLink: "https://empleos.example/python-etl",
    },
    {
        titulo: "QA Tester",
        empresa: "Calidad Soft",
        modalidad: "hibrido",
        ubicacion: "Arequipa",
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Pruebas manuales y automatizadas. Detalle.",
        skills: ["Testing", "QA"],
        applyLink: "https://empleos.example/qa-tester",
    },
    {
        titulo: "Asistente Administrativo",
        empresa: "Oficina Central",
        modalidad: "presencial",
        ubicacion: "Lima",
        salarioMin: 1500,
        salarioMax: null,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "Manejo de Excel y organización. No técnico.",
        skills: ["Excel", "Organización"],
        applyLink: "https://empleos.example/admin",
    },
    {
        titulo: "Community Manager",
        empresa: "Marca Digital",
        modalidad: "remoto",
        ubicacion: null,
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Redes sociales, creación de contenido.",
        skills: ["Marketing", "Redes sociales"],
        applyLink: "https://empleos.example/community",
    },
];

function parseEmail(argv: string[]): string {
    for (const arg of argv) {
        if (arg.startsWith("--email=")) {
            return arg.slice("--email=".length);
        }
    }
    throw new Error(
        "Usage: pnpm db:seed-demo -- --email=<your-signed-in-email>",
    );
}

async function main(): Promise<void> {
    const email = parseEmail(process.argv.slice(2));

    const [row] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
    if (!row) {
        throw new Error(
            `No user with email ${email}. Sign in once in the app first, then re-run.`,
        );
    }
    const userId = row.id;

    const profileEmbedding = await embedText(
        buildProfileEmbeddingText({
            escuelaProfesional: DEMO_PROFILE.escuelaProfesional,
            skills: DEMO_PROFILE.skills,
            experienciaResumen: DEMO_PROFILE.experienciaResumen,
            intereses: DEMO_PROFILE.intereses,
        }),
    );
    const profileFields = {
        escuelaProfesional: DEMO_PROFILE.escuelaProfesional,
        grado: DEMO_PROFILE.grado,
        ubicacion: DEMO_PROFILE.ubicacion,
        skills: DEMO_PROFILE.skills,
        experienciaResumen: DEMO_PROFILE.experienciaResumen,
        intereses: DEMO_PROFILE.intereses,
        expectativaSalarial: DEMO_PROFILE.expectativaSalarial,
        embedding: profileEmbedding,
    };
    await db
        .insert(profiles)
        .values({ userId, ...profileFields })
        .onConflictDoUpdate({
            target: profiles.userId,
            set: { ...profileFields, updatedAt: new Date() },
        });
    console.log("seeded profile");

    let inserted = 0;
    for (let i = 0; i < DEMO_JOBS.length; i++) {
        const j = DEMO_JOBS[i];
        const embedding = await embedText(
            buildJobEmbeddingText({
                titulo: j.titulo,
                requisitos: j.requisitos,
                skills: j.skills,
            }),
        );
        const result = await db
            .insert(jobs)
            .values({
                sourceSender: "demo@careerboost.local",
                titulo: j.titulo,
                empresa: j.empresa,
                modalidad: j.modalidad,
                ubicacion: j.ubicacion,
                salarioMin: j.salarioMin,
                salarioMax: j.salarioMax,
                moneda: j.moneda,
                salarioPeriodo: j.salarioPeriodo,
                salarioExplicito: j.salarioExplicito,
                requisitos: j.requisitos,
                skills: j.skills,
                applyLink: j.applyLink,
                dedupeHash: computeDedupeHash({
                    titulo: j.titulo,
                    empresa: j.empresa,
                    weekDate: SEED_WEEK_DATE,
                }),
                embedding,
            })
            .onConflictDoNothing()
            .returning({ id: jobs.id });
        inserted += result.length;
    }
    console.log(`seeded ${inserted} jobs (of ${DEMO_JOBS.length})`);

    await db.insert(ingestionRuns).values({
        userId,
        finishedAt: new Date(),
        emailsScanned: 40,
        jobsFound: DEMO_JOBS.length,
        noiseFiltered: 11,
        dupesRemoved: 3,
    });
    console.log("seeded ingestion run");

    const { count } = await runMatching({ userId });
    console.log(`matching done: ${count} matches`);

    console.log(
        `\nDemo ready for ${email}. Open /feed and /digest in the app.`,
    );
    process.exit(0);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
