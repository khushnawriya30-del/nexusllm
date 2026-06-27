# Implementation Plan: Analytics Dashboard

## Overview

This plan implements the Analytics Dashboard on top of NexusLLM's existing request-logging infrastructure. Work starts with the pure backend core (cost estimation and the property-tested aggregation functions), layers persistence and standardized tracking on top, exposes admin-authenticated analytics endpoints, and finishes with the Next.js `/analytics` page and its components. Each task builds on the previous ones and ends by wiring the new pieces into the running app.

Backend code is Python (FastAPI, `pytest` + Hypothesis); frontend code is TypeScript (Next.js 14 App Router, React Query, Zustand, Recharts). Property-based tests target the pure analytics core defined in the design's Correctness Properties section.

## Tasks

- [ ] 1. Implement cost and savings estimation core
  - [ ] 1.1 Implement Price_Table and CostEstimator
    - Create `backend/core/pricing.py` with the frozen `ModelPrice` dataclass and a `PRICE_TABLE` mapping concrete model ids to paid-equivalent input/output prices per 1,000,000 tokens
    - Implement `CostEstimator.estimate_cost` (formula `input*input_price/1e6 + output*output_price/1e6`, unknown model → 0.0, rounded to 6 dp) and `estimate` returning `(cost, savings)` where savings == cost for free/trial provider categories else 0.0
    - _Requirements: 1.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 1.2 Write property test for cost formula and linearity
    - **Property 1: Cost estimation matches the formula and scales linearly**
    - In `backend/tests/test_analytics_properties.py`, generate non-negative token counts and priced models; assert the formula equals, non-negativity, and additivity in token counts
    - **Validates: Requirements 1.5, 3.2, 3.5**

  - [ ]* 1.3 Write property test for unknown-model cost
    - **Property 2: Unknown models cost zero**
    - For any model id absent from `PRICE_TABLE` and any token counts, `estimate_cost` returns exactly 0
    - **Validates: Requirements 3.3**

  - [ ]* 1.4 Write property test for free-tier savings
    - **Property 3: Free-tier savings equal cost**
    - For free/trial provider category, any model, and any token counts, `estimate` returns savings equal to cost
    - **Validates: Requirements 3.4**

  - [ ]* 1.5 Write unit tests for CostEstimator
    - In `backend/tests/test_pricing.py`, assert a known model's exact USD value, 6-decimal rounding, and free-vs-paid savings examples
    - _Requirements: 3.2, 3.4, 3.5_

- [ ] 2. Implement analytics data types and record normalization
  - [ ] 2.1 Define core analytics data types and normalization
    - Create `backend/core/analytics_aggregation.py` with `RequestType`, frozen dataclasses `AnalyticsRecord`, `FilterSet`, and result types (`Overview`, `ProviderStat`, `ModelStat`, `TimeSeriesBundle`, `ErrorEntry`, `RequestRow`)
    - Implement a pure `normalize_record` helper that applies the `request_type` default (`chat` when missing/null), derives `success = 200 <= status_code < 300`, computes `request_started_at = timestamp - total_latency_ms`, coerces absent token counts to 0, and derives `error_type` from the last attempt's `failure_class`/status class
    - _Requirements: 1.1, 1.4, 2.3_

  - [ ]* 2.2 Write property test for request-type normalization
    - **Property 4: Request-type normalization defaults to chat**
    - Missing/null `request_type` normalizes to `chat`; any valid value is preserved
    - **Validates: Requirements 2.3**

- [ ] 3. Implement pure aggregation functions
  - [ ] 3.1 Implement apply_filters
    - Add `apply_filters(records, filters)` to `analytics_aggregation.py` applying every active predicate (date range, provider, model, status, request type, total-token range), preserving input order
    - _Requirements: 9.1, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 3.2 Write property test for filtering
    - **Property 8: The filter set selects exactly the matching records and is idempotent**
    - **Validates: Requirements 9.1, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6**

  - [ ] 3.3 Implement build_overview
    - Add `build_overview(records)` returning counts, success/error rates (0 when empty), token sums, mean latency (0 when empty), cost/savings sums, and distinct provider/model counts
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 3.4 Write property test for overview aggregation
    - **Property 5: Overview aggregation equals direct aggregation**
    - **Validates: Requirements 4.1, 4.4, 4.5, 4.6, 4.7**

  - [ ]* 3.5 Write property test for success/error rates
    - **Property 6: Success and error rates are well-formed**
    - **Validates: Requirements 4.2, 4.3**

  - [ ] 3.6 Implement provider and model breakdowns
    - Add `build_provider_breakdown(records)` and `build_model_breakdown(records)` returning one group per distinct key with per-group counts, rates, average latency, token sums, cost, and savings; empty input → empty list
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 3.7 Write property test for grouped breakdowns
    - **Property 7: Grouped breakdowns partition the records and match per-group aggregates**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5**

  - [ ] 3.8 Implement time-series and distributions
    - Add `select_bucket_interval(start, end)` (range→width table from design), `build_time_series(records, start, end, interval)` producing an ordered fixed-width bucket axis with all series aligned (empty buckets → 0), and the per-provider, per-model, and failed-by-error-type distributions
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 3.9 Write property test for bucket axis
    - **Property 9: Time-series buckets form an ordered, fixed-width axis covering the range**
    - **Validates: Requirements 7.1, 7.6**

  - [ ]* 3.10 Write property test for bucket-aligned series
    - **Property 10: Time-series values are bucket-aligned and conserve totals**
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 3.11 Write property test for distributions
    - **Property 11: Distributions conserve counts**
    - **Validates: Requirements 7.4, 7.5**

  - [ ]* 3.12 Write unit tests for select_bucket_interval thresholds
    - In `backend/tests/test_analytics_aggregation.py`, assert the 1h / 6h / 24h / 7d / 30d boundary widths
    - _Requirements: 7.6_

  - [ ] 3.13 Implement recent_errors and query_requests
    - Add `recent_errors(records, limit)` (failures only, most-recent-first, bounded, full diagnostic fields) and `query_requests(records, search, sort_by, sort_dir, page, page_size)` returning `(page_rows, total)` with search over model/provider, ordered sort, and slice-based pagination
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 3.14 Write property test for recent errors
    - **Property 12: Recent errors are failures-only, ordered, complete, and bounded**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [ ]* 3.15 Write property test for search
    - **Property 13: Search returns exactly the rows matching the term**
    - **Validates: Requirements 9.2**

  - [ ]* 3.16 Write property test for sorting
    - **Property 14: Sorting yields an ordered permutation**
    - **Validates: Requirements 9.3**

  - [ ]* 3.17 Write property test for pagination
    - **Property 15: Pagination slices correctly and conserves rows**
    - **Validates: Requirements 9.4, 9.5**

- [ ] 4. Checkpoint - analytics core
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Persist analytics fields in the request log store
  - [ ] 5.1 Add schema migration and record parameters
    - In `backend/core/request_log.py`, make `init_db` idempotently add `request_type TEXT NOT NULL DEFAULT 'chat'`, `estimated_cost_usd REAL NOT NULL DEFAULT 0`, and `estimated_savings_usd REAL NOT NULL DEFAULT 0` via `PRAGMA table_info` + `ALTER TABLE`, preserving existing rows; extend `record(...)` to accept and write the three new fields
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 5.2 Write integration test for the migration
    - In `backend/tests/test_request_log_migration.py`, create a legacy table without the new columns, insert rows, run `init_db`, and assert columns are added, rows preserved, and legacy rows read back with `request_type = 'chat'`
    - _Requirements: 2.2, 2.3_

- [ ] 6. Implement AnalyticsTracker and AnalyticsRepository
  - [ ] 6.1 Implement AnalyticsTracker
    - Create `backend/core/analytics.py` with `AnalyticsTracker(store, estimator, config)` and an async `track(result, *, request_type, is_stream)` that resolves provider category from config, computes cost/savings via `CostEstimator`, and persists the standardized record; wrap estimation/persistence in try/except so it never raises into the request path
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 6.2 Implement AnalyticsRepository
    - Create `backend/core/analytics_repository.py` with `AnalyticsRepository(db_path)` and async `load(start, end)` that reads date-range rows from the SQLite file and returns normalized `AnalyticsRecord` objects via `normalize_record`
    - _Requirements: 9.1, 10.1_

  - [ ]* 6.3 Write unit tests for AnalyticsTracker
    - In `backend/tests/test_analytics_tracker.py`, assert the standardized field set is recorded for chat/embeddings/completions, the failure path persists status code and error reason, and each `request_type` is persisted
    - _Requirements: 1.1, 1.2, 1.3, 2.1_

- [ ] 7. Wire tracking into the routed endpoints
  - [ ] 7.1 Construct the tracker in app lifespan
    - In `backend/main.py`, build `CostEstimator` and `AnalyticsTracker` during lifespan and expose them as `app.state.analytics_tracker`
    - _Requirements: 1.1, 1.5_

  - [ ] 7.2 Call the tracker from chat, embeddings, and completions
    - Replace the bespoke `_log` helper in `backend/api/chat.py` and the inline `store.record(...)` blocks in `backend/api/embeddings.py` and `backend/api/completions.py` with `analytics_tracker.track(result, request_type=..., is_stream=...)`, guarded by `config.app.enable_request_logging`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 8. Implement the Analytics API router
  - [ ] 8.1 Implement parse_filters and analytics endpoints
    - Create `backend/api/analytics.py` with a `parse_filters` dependency (validates start/end ISO + `start<=end`, status, request_type, non-negative `min<=max` tokens; raises `HTTPException(422)` naming the offending param) and the routes `GET /admin/analytics/{overview,providers,models,timeseries,errors,requests}`, each depending on `require_admin`, loading via the repository, applying `apply_filters`, and returning the documented JSON contracts (default range = last 24h)
    - _Requirements: 4.1-4.8, 5.1-5.5, 6.1-6.5, 7.1-7.6, 8.1-8.4, 9.1-9.5, 10.7, 11.1, 11.2_

  - [ ] 8.2 Mount the analytics router
    - Register the analytics router in `backend/main.py` under the existing `/admin` surface
    - _Requirements: 11.1, 11.2_

  - [ ]* 8.3 Write unit tests for parse_filters
    - In `backend/tests/test_analytics_api.py`, assert invalid status/request_type/token-range/timestamp values each return 422 with a descriptive message and that an omitted range defaults to the last 24 hours
    - _Requirements: 10.7, 4.8_

  - [ ]* 8.4 Write integration tests for auth and endpoint shape
    - Using FastAPI `TestClient` in `backend/tests/test_analytics_api.py`, assert each route returns 401 without/with an invalid Bearer token and 200 with a valid one, and that a seeded DB yields the documented JSON shape for each endpoint
    - _Requirements: 11.1, 11.2_

- [ ] 9. Checkpoint - backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Build the frontend data layer
  - [ ] 10.1 Add the Recharts dependency
    - Add `recharts` to `frontend/package.json` dependencies and install it
    - _Requirements: 15.1, 15.5_

  - [ ] 10.2 Add analytics response and filter types
    - In `frontend/lib/types.ts`, add `AnalyticsOverview`, `ProviderStat`, `ModelStat`, `TimeSeriesBundle`, `AnalyticsErrorEntry`, `RecentRequestRow`, `PaginatedRequests`, and `AnalyticsFilterSet` mirroring the backend contracts
    - _Requirements: 4.1-4.8, 5.1-5.5, 6.1-6.5, 7.1-7.6, 8.1-8.4, 9.1-9.5_

  - [ ] 10.3 Add analytics API client methods
    - In `frontend/lib/api.ts`, add `api.analytics.{overview,providers,models,timeseries,errors,requests}(filters)` using the admin-authenticated `getJSON` helper and a `toQueryString(filters)` serializer over the `/api/*` rewrite
    - _Requirements: 10.1-10.6, 11.2_

  - [ ] 10.4 Add the Zustand filter store
    - Create `frontend/store/analyticsFilters.ts` holding the active `Filter_Set` with a `reset()` that restores the default 24h range and clears provider/model/status/request_type/token constraints
    - _Requirements: 18.1, 18.3_

  - [ ] 10.5 Add React Query analytics hooks
    - Create `frontend/hooks/useAnalytics.ts` with `useAnalyticsOverview/Providers/Models/TimeSeries/Errors/Requests` keyed by the filter set (refetch on change) and a `refetchInterval` for auto-update
    - _Requirements: 13.2, 15.2, 18.2_

- [ ] 11. Add navigation and the page shell
  - [ ] 11.1 Add the Analytics tab to the NavBar
    - In `frontend/components/ui/NavBar.tsx`, add `{ href: "/analytics", label: "Analytics" }` to `TABS` so it renders alongside Models/Playground/Keys with the existing active-state logic
    - _Requirements: 12.1, 12.2_

  - [ ] 11.2 Create the analytics page and shared primitives
    - Create `frontend/app/analytics/page.tsx` (client component) plus shared `EmptyState`, `LoadingSkeleton`, and `ChartCard` components in `frontend/components/analytics/`, applying the dashboard visual conventions (`rounded-3xl border border-white/[0.06] bg-bg-secondary/50`) and theme tokens
    - _Requirements: 12.3, 19.1, 19.2, 19.3_

- [ ] 12. Build the analytics page sections
  - [ ] 12.1 Build the filter controls
    - Create `frontend/components/analytics/AnalyticsFilters.tsx` with Date_Range, provider, model, status, request_type, and token-range controls bound to the filter store
    - _Requirements: 18.1, 18.2, 18.3_

  - [ ] 12.2 Build the overview cards
    - Create `OverviewCards.tsx` and `OverviewCard.tsx` rendering all 13 metric tiles with loading skeletons and zero-value rendering
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ] 12.3 Build the provider and model sections
    - Create `ProviderSection.tsx` and `ModelSection.tsx` rendering the full per-provider and per-model metric sets with empty states
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ] 12.4 Build the charts
    - Create the `charts/` components (Requests/Token Usage/Input-vs-Output/Requests-by-Provider/Requests-by-Model/Success-vs-Failed/Latency/Cost/Savings trends, Provider and Error distributions) using Recharts `ResponsiveContainer`, theme-driven colors, and loading/empty states
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ] 12.5 Build the recent errors view
    - Create `RecentErrorsView.tsx` showing each error's provider, model, message, type, status code, timestamp, and request id, ordered most-recent-first, with an empty state
    - _Requirements: 16.1, 16.2, 16.3_

  - [ ] 12.6 Build the recent requests table
    - Create `RecentRequestsTable.tsx` with per-row metrics, search, sortable columns, pagination, and loading and empty states
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ] 12.7 Wire the sections into the page
    - Assemble the filters, overview cards, provider/model sections, charts, recent-errors view, and recent-requests table into `frontend/app/analytics/page.tsx`, driving every section from the shared filter store and rendering section-level fetch errors
    - _Requirements: 18.2, 19.3, 19.4_

- [ ] 13. Frontend component tests
  - [ ]* 13.1 Test navigation and route mounting
    - Assert the NavBar shows the Analytics tab, marks it active on `/analytics`, and the page mounts at `/analytics`
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 13.2 Test overview cards
    - Assert all 13 metrics render, skeletons show while loading, zero values render for empty data, and values update when mocked query data changes
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 13.3 Test provider/model sections and charts
    - Assert data, loading, and empty states for the provider/model sections and charts
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 15.1, 15.3, 15.4_

  - [ ]* 13.4 Test recent errors view and requests table
    - Assert the errors view renders entries and its empty state, and the requests table renders rows and supports search/sort/pagination plus loading and empty states
    - _Requirements: 16.1, 16.2, 16.3, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ]* 13.5 Test filters and reset
    - Assert filter changes update the store and re-drive sections, and reset restores the 24h default and clears other constraints
    - _Requirements: 18.1, 18.2, 18.3_

  - [ ]* 13.6 Test error, theme, and responsive presentation
    - Assert section error messages render on failed fetches and verify theme tokens and single-column narrow layout via class assertions
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

- [ ] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP.
- Each task references specific requirements for traceability; property tasks also cite the design property they validate.
- Property-based tests (Hypothesis, min 100 examples each) verify the universal properties of the pure analytics core; unit, integration, and component tests cover examples, defaulting, migration, auth, and UI presentation.
- Checkpoints provide incremental validation at the end of the core, backend, and full feature.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "5.1", "10.1", "10.2", "10.4", "11.1"] },
    { "id": 1, "tasks": ["1.2", "1.5", "3.1", "5.2", "6.1", "6.2", "10.3"] },
    { "id": 2, "tasks": ["1.3", "3.3", "6.3", "7.1", "10.5"] },
    { "id": 3, "tasks": ["1.4", "3.6", "7.2", "11.2", "12.1", "12.2", "12.3", "12.4", "12.5", "12.6"] },
    { "id": 4, "tasks": ["2.2", "3.8", "12.7", "13.1", "13.2", "13.3", "13.4", "13.5"] },
    { "id": 5, "tasks": ["3.2", "3.12", "3.13", "13.6"] },
    { "id": 6, "tasks": ["3.4", "8.1"] },
    { "id": 7, "tasks": ["3.5", "8.2", "8.3"] },
    { "id": 8, "tasks": ["3.7", "8.4"] },
    { "id": 9, "tasks": ["3.9"] },
    { "id": 10, "tasks": ["3.10"] },
    { "id": 11, "tasks": ["3.11"] },
    { "id": 12, "tasks": ["3.14"] },
    { "id": 13, "tasks": ["3.15"] },
    { "id": 14, "tasks": ["3.16"] },
    { "id": 15, "tasks": ["3.17"] }
  ]
}
```
