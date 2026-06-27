"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useUnifiedKey() {
  return useQuery({ queryKey: ["unified-key"], queryFn: api.unifiedKey });
}

export function useSupportedProviders() {
  return useQuery({
    queryKey: ["supported-providers"],
    queryFn: api.supportedProviders,
    staleTime: 60000,
  });
}

export function useKeyGroups() {
  return useQuery({
    queryKey: ["key-groups"],
    queryFn: api.keyGroups,
    refetchInterval: 15000,
  });
}
