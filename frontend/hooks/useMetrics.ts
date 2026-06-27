"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useMetrics() {
  return useQuery({
    queryKey: ["metrics"],
    queryFn: api.metrics,
    refetchInterval: 5000,
  });
}

export function useLogs(limit = 100, search = "") {
  return useQuery({
    queryKey: ["logs", limit, search],
    queryFn: () => api.logs(limit, search),
    refetchInterval: 5000,
  });
}

export function useCircuitBreakers() {
  return useQuery({
    queryKey: ["circuit-breakers"],
    queryFn: api.circuitBreakers,
    refetchInterval: 5000,
  });
}
