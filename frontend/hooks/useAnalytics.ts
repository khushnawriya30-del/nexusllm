"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnalyticsFilters } from "@/lib/types";

/** Combined analytics payload (cards, provider/model breakdowns, charts, errors). */
export function useAnalytics(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", filters],
    queryFn: () => api.analytics(filters),
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });
}

/** Paginated/filtered recent requests for the table. */
export function useAnalyticsRequests(
  filters: AnalyticsFilters & {
    search?: string;
    sort?: string;
    direction?: string;
    page?: number;
    page_size?: number;
  },
) {
  return useQuery({
    queryKey: ["analytics-requests", filters],
    queryFn: () => api.analyticsRequests(filters),
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });
}
