"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, useElysia } from "@/frontend/lib/eden";

// --- Queries ---

export function useMe() {
    const api = useElysia();
    return useQuery(api.me.get.queryOptions());
}

export function useProfile() {
    const api = useElysia();
    return useQuery(api.profile.get.queryOptions());
}

export function useLastIngestion() {
    const api = useElysia();
    return useQuery(api.ingest.last.get.queryOptions());
}

export interface FeedFilters {
    solo_con_salario?: string;
    modalidad?: string;
    ubicacion?: string;
}

export function useFeed(filters: FeedFilters) {
    const api = useElysia();
    return useQuery(api.match.get.queryOptions(filters));
}

export function useDigest() {
    const api = useElysia();
    return useQuery(api.digest.get.queryOptions());
}

export function useInbox() {
    const api = useElysia();
    return useQuery(api.inbox.get.queryOptions());
}

// --- Mutations (raw treaty client for deterministic typing) ---

export function useRunIngestion() {
    const api = useElysia();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await apiClient.api.v1.ingest.post();
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: api.ingest.last.get.queryKey(),
            });
        },
    });
}

export function useRunMatching() {
    const api = useElysia();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await apiClient.api.v1.match.post();
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: api.match.get.queryKey() });
        },
    });
}

export function useUploadCv() {
    const api = useElysia();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (vars: { file: File }) => {
            const res = await apiClient.api.v1.profile.cv.post({
                file: vars.file,
            });
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: api.profile.get.queryKey() });
            qc.invalidateQueries({ queryKey: api.me.get.queryKey() });
        },
    });
}

export interface ProfileEdit {
    escuelaProfesional?: string;
    grado?: string;
    ubicacion?: string;
    intereses?: string[];
    skills?: string[];
    experienciaResumen?: string;
    expectativaSalarial?: number | null;
}

export function useUpdateProfile() {
    const api = useElysia();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (vars: ProfileEdit) => {
            const res = await apiClient.api.v1.profile.put(vars);
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: api.profile.get.queryKey() });
        },
    });
}

export type MatchStatus = "seen" | "saved" | "dismissed";

export function useSetMatchStatus() {
    const api = useElysia();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (vars: { id: string; status: MatchStatus }) => {
            const res = await apiClient.api.v1
                .match({ id: vars.id })
                .patch({ status: vars.status });
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: api.match.get.queryKey() });
            qc.invalidateQueries({ queryKey: api.digest.get.queryKey() });
        },
    });
}

export function useInboxLive() {
    return useMutation({
        mutationFn: async () => {
            const res = await apiClient.api.v1.inbox.live.get();
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
    });
}

export function useMarkDigestSeen() {
    const api = useElysia();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await apiClient.api.v1.digest.seen.post();
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: api.digest.get.queryKey() });
            qc.invalidateQueries({ queryKey: api.match.get.queryKey() });
        },
    });
}
