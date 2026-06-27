# Requirements Document

## Introduction

The Analytics Dashboard adds a dedicated observability surface to NexusLLM, the self-hosted OpenAI-compatible LLM gateway (FastAPI backend, Next.js 14 App Router frontend with Tailwind, React Query, and Zustand). NexusLLM already captures the raw signals needed for analytics: an in-memory `Metrics` tracker (`backend/utils/metrics.py`), a persisted SQLite `request_logs` table (`backend/core/request_log.py`), per-attempt routing outcomes via `RouteResult`/`RouteAttempt` (`backend/core/routing.py`, `backend/models/responses.py`), and admin endpoints (`backend/api/admin.py`) such as `/admin/metrics`, `/admin/logs`, and `/admin/circuit-breakers` guarded by Bearer admin authentication. The frontend still has the `useMetrics`/`useLogs`/`useCircuitBreakers` hooks, but the Analytics UI was removed and no charting library is installed.

This feature reuses that existing infrastructure rather than rebuilding it. It adds the missing pieces: standardized per-request analytics tracking across all routed endpoints (chat, embeddings, completions), cost-and-savings estimation backed by a per-model price table (providers run on free tiers, so "savings" represents the paid-equivalent cost avoided), time-series and aggregation endpoints that feed charts and tables, a recent-errors view, an optional `request_type` column on `request_logs`, and a complete frontend Analytics page reachable from a new "Analytics" navigation tab at the `/analytics` route. The frontend matches the existing dashboard look and feel (rounded-3xl cards, `border-white/[0.06]`, `bg-bg-secondary/50`, `SegmentToggle`, `TokenBudgetCard`/`RoutingStrategyCard` as reference), supports light and dark modes, is responsive, auto-updates where supported, and provides explicit empty and loading states.

## Glossary

- **Analytics_API**: The set of FastAPI admin endpoints that expose aggregated analytics data (overview, per-provider, per-model, time-series, recent errors, recent requests). All endpoints require admin Bearer authentication consistent with the existing `/admin/*` routes.
- **Analytics_Tracker**: The backend component that records standardized analytics fields for every routed request, consistent across chat, embeddings, and completions endpoints.
- **Request_Log_Store**: The existing `RequestLogStore` (`backend/core/request_log.py`) persisting rows in the SQLite `request_logs` table.
- **Cost_Estimator**: The backend component that computes Estimated Cost and Estimated Savings from token counts and the Price_Table.
- **Price_Table**: A per-model configuration mapping a model identifier to a paid-equivalent input-token price and output-token price (per 1,000,000 tokens), used by the Cost_Estimator.
- **Estimated_Cost**: The paid-equivalent monetary value computed from input/output token counts and the Price_Table for the model actually used.
- **Estimated_Savings**: The paid-equivalent monetary value avoided because the request was served by a free-tier provider; for free-tier usage this equals the Estimated_Cost that would otherwise have been incurred.
- **Request_Type**: A classification of a routed request as one of `chat`, `embeddings`, or `completions`.
- **Overview_Card**: A single summary metric tile on the Analytics page (for example Total Requests or Success Rate).
- **Analytics_Page**: The Next.js page rendered at the `/analytics` route.
- **NavBar**: The existing top navigation component (`frontend/components/ui/NavBar.tsx`).
- **Time_Series_Point**: A `(bucket_start, value)` data point produced by aggregating request logs into fixed time buckets over a selected date range.
- **Date_Range**: A user-selected start and end timestamp constraining the data shown on the Analytics_Page.
- **Filter_Set**: The combination of active filters: Date_Range, provider, model, status, Request_Type, and token-usage range.
- **Recent_Errors_View**: The Analytics_Page section listing recently failed requests with diagnostic detail.
- **Recent_Requests_Table**: The Analytics_Page live table listing recent requests with per-row metrics, supporting filtering, searching, sorting, and pagination.
- **Empty_State**: The UI presentation shown when a data set contains zero matching records.
- **Loading_State**: The UI presentation shown while analytics data is being fetched.

## Requirements

### Requirement 1: Standardized Per-Request Analytics Tracking

**User Story:** As a NexusLLM operator, I want every routed request to record a consistent set of analytics fields, so that the dashboard reflects accurate, comparable data across chat, embeddings, and completions.

#### Acceptance Criteria

1. WHEN a routed request completes through the chat, embeddings, or completions endpoint, THE Analytics_Tracker SHALL record the provider used, the model used, the request timestamp, the response timestamp, the total duration in milliseconds, the input token count, the output token count, the total token count, the success-or-failure outcome, and the request identifier.
2. IF a routed request fails, THEN THE Analytics_Tracker SHALL record the failure outcome together with the HTTP status code and the error reason.
3. THE Analytics_Tracker SHALL record the same set of analytics fields for chat requests, embeddings requests, and completions requests.
4. WHEN the input token count or the output token count is unavailable from the upstream response, THE Analytics_Tracker SHALL record that count as 0.
5. WHEN a request completes, THE Cost_Estimator SHALL compute the Estimated_Cost and the Estimated_Savings for that request and THE Analytics_Tracker SHALL record both values.

### Requirement 2: Request Type Persistence

**User Story:** As a NexusLLM operator, I want each request log to record whether it was a chat, embeddings, or completions call, so that I can filter and aggregate analytics by request type.

#### Acceptance Criteria

1. THE Request_Log_Store SHALL persist a Request_Type value of `chat`, `embeddings`, or `completions` for each request log row.
2. WHEN the Request_Log_Store initializes a database that lacks the Request_Type column, THE Request_Log_Store SHALL add the Request_Type column while preserving existing rows.
3. WHERE an existing request log row has no recorded Request_Type, THE Analytics_API SHALL treat that row's Request_Type as `chat`.

### Requirement 3: Cost and Savings Estimation

**User Story:** As a NexusLLM operator, I want estimated cost and estimated savings derived from a per-model price table, so that I can quantify the paid-equivalent value of free-tier usage.

#### Acceptance Criteria

1. THE Price_Table SHALL map each known model identifier to a paid-equivalent input-token price and output-token price expressed per 1,000,000 tokens.
2. WHEN computing Estimated_Cost for a request, THE Cost_Estimator SHALL multiply the input token count by the model's input-token price and the output token count by the model's output-token price, each divided by 1,000,000, and SHALL return the sum.
3. WHERE the model used has no entry in the Price_Table, THE Cost_Estimator SHALL compute Estimated_Cost as 0.
4. WHEN a request is served by a free-tier provider, THE Cost_Estimator SHALL set the Estimated_Savings equal to the Estimated_Cost that would otherwise have been incurred.
5. THE Cost_Estimator SHALL express Estimated_Cost and Estimated_Savings in United States dollars.

### Requirement 4: Overview Metrics Endpoint

**User Story:** As a NexusLLM operator, I want an endpoint that returns aggregate analytics for a selected date range, so that the dashboard can render overview cards.

#### Acceptance Criteria

1. WHEN the Analytics_API receives an authenticated overview request for a Date_Range, THE Analytics_API SHALL return the total request count, the successful request count, and the failed request count for requests within the Date_Range.
2. THE Analytics_API SHALL return the success rate as a percentage computed as 100 multiplied by successful requests divided by total requests, and the error rate as a percentage computed as 100 multiplied by failed requests divided by total requests.
3. WHEN the total request count for the Date_Range is 0, THE Analytics_API SHALL return a success rate of 0 and an error rate of 0.
4. THE Analytics_API SHALL return the total input token count, the total output token count, and the total token count for the Date_Range.
5. THE Analytics_API SHALL return the average latency in milliseconds across requests in the Date_Range.
6. THE Analytics_API SHALL return the total Estimated_Cost and the total Estimated_Savings for the Date_Range.
7. THE Analytics_API SHALL return the count of distinct providers and the count of distinct models observed in the Date_Range.
8. IF the request omits a Date_Range, THEN THE Analytics_API SHALL apply a default Date_Range covering the most recent 24 hours.

### Requirement 5: Per-Provider Analytics Endpoint

**User Story:** As a NexusLLM operator, I want per-provider analytics, so that I can compare provider performance and value.

#### Acceptance Criteria

1. WHEN the Analytics_API receives an authenticated per-provider request for a Date_Range, THE Analytics_API SHALL return, for each provider observed in the Date_Range, the request count, the success rate, and the error rate.
2. THE Analytics_API SHALL return, for each provider, the average latency in milliseconds.
3. THE Analytics_API SHALL return, for each provider, the input token count, the output token count, and the total token count.
4. THE Analytics_API SHALL return, for each provider, the total Estimated_Cost and the total Estimated_Savings.
5. WHEN no requests exist for the Date_Range, THE Analytics_API SHALL return an empty provider list.

### Requirement 6: Per-Model Analytics Endpoint

**User Story:** As a NexusLLM operator, I want per-model analytics, so that I can see which models drive usage, cost, and savings.

#### Acceptance Criteria

1. WHEN the Analytics_API receives an authenticated per-model request for a Date_Range, THE Analytics_API SHALL return, for each model observed in the Date_Range, the total request count, the successful request count, and the failed request count.
2. THE Analytics_API SHALL return, for each model, the success rate and the average latency in milliseconds.
3. THE Analytics_API SHALL return, for each model, the input token count, the output token count, and the total token count.
4. THE Analytics_API SHALL return, for each model, the total Estimated_Cost and the total Estimated_Savings.
5. WHEN no requests exist for the Date_Range, THE Analytics_API SHALL return an empty model list.

### Requirement 7: Time-Series Aggregation Endpoint

**User Story:** As a NexusLLM operator, I want time-bucketed series for the selected date range, so that the dashboard can render trend charts.

#### Acceptance Criteria

1. WHEN the Analytics_API receives an authenticated time-series request for a Date_Range, THE Analytics_API SHALL aggregate matching request logs into ordered, fixed-width Time_Series_Points spanning the Date_Range.
2. THE Analytics_API SHALL return a Time_Series_Point series for request count over time, for total token usage over time, for input token count over time, for output token count over time, for successful request count over time, for failed request count over time, for average latency over time, for Estimated_Cost over time, and for Estimated_Savings over time.
3. WHEN a time bucket contains no matching requests, THE Analytics_API SHALL return that bucket with a value of 0.
4. THE Analytics_API SHALL return the request-count distribution grouped by provider and the request-count distribution grouped by model for the Date_Range.
5. THE Analytics_API SHALL return the count of failed requests grouped by error type for the Date_Range.
6. WHEN the request specifies a bucket interval, THE Analytics_API SHALL produce Time_Series_Points at that interval; otherwise THE Analytics_API SHALL select a bucket interval derived from the Date_Range length.

### Requirement 8: Recent Errors Endpoint

**User Story:** As a NexusLLM operator, I want a list of recent failed requests with diagnostic detail, so that I can investigate failures quickly.

#### Acceptance Criteria

1. WHEN the Analytics_API receives an authenticated recent-errors request, THE Analytics_API SHALL return failed requests ordered from most recent to least recent.
2. THE Analytics_API SHALL return, for each failed request, the provider, the model, the error message, the error type, the HTTP status code, the timestamp, and the request identifier.
3. WHEN a maximum result count is specified, THE Analytics_API SHALL return at most that number of failed requests.
4. WHEN no failed requests exist for the applied filters, THE Analytics_API SHALL return an empty error list.

### Requirement 9: Recent Requests Endpoint with Filtering, Search, Sort, and Pagination

**User Story:** As a NexusLLM operator, I want a queryable list of recent requests, so that the dashboard table can filter, search, sort, and paginate the data.

#### Acceptance Criteria

1. WHEN the Analytics_API receives an authenticated recent-requests query, THE Analytics_API SHALL return requests matching the applied Filter_Set, each row including the timestamp, the provider, the model, the status, the input token count, the output token count, the total token count, the response time in milliseconds, the Estimated_Cost, and the Estimated_Savings.
2. WHERE a search term is supplied, THE Analytics_API SHALL return only requests whose model or provider contains the search term.
3. WHERE a sort field and sort direction are supplied, THE Analytics_API SHALL return the requests ordered by that field in that direction.
4. WHEN a page number and page size are supplied, THE Analytics_API SHALL return the corresponding page of results and the total count of matching requests.
5. IF a requested page exceeds the available results, THEN THE Analytics_API SHALL return an empty result page with the total count of matching requests.

### Requirement 10: Filtering Across Analytics Endpoints

**User Story:** As a NexusLLM operator, I want a consistent Filter_Set applied across analytics queries, so that all views reflect the same scope.

#### Acceptance Criteria

1. WHERE a Date_Range filter is supplied, THE Analytics_API SHALL include only requests whose timestamp falls within the Date_Range.
2. WHERE a provider filter is supplied, THE Analytics_API SHALL include only requests served by that provider.
3. WHERE a model filter is supplied, THE Analytics_API SHALL include only requests served by that model.
4. WHERE a status filter of success or failed is supplied, THE Analytics_API SHALL include only requests with that outcome.
5. WHERE a Request_Type filter is supplied, THE Analytics_API SHALL include only requests of that Request_Type.
6. WHERE a token-usage range filter is supplied, THE Analytics_API SHALL include only requests whose total token count falls within that range.
7. IF a supplied filter value is invalid, THEN THE Analytics_API SHALL return a descriptive error and an HTTP status code of 422.

### Requirement 11: Analytics API Authentication

**User Story:** As a NexusLLM operator, I want analytics endpoints protected by admin authentication, so that usage data is not exposed to unauthorized callers.

#### Acceptance Criteria

1. WHEN a request to an Analytics_API endpoint omits a valid admin Bearer credential, THE Analytics_API SHALL reject the request with an HTTP status code of 401.
2. WHEN a request to an Analytics_API endpoint includes a valid admin Bearer credential, THE Analytics_API SHALL process the request.

### Requirement 12: Analytics Navigation Entry and Route

**User Story:** As a NexusLLM operator, I want an Analytics tab and a dedicated route, so that I can reach the dashboard from anywhere in the app.

#### Acceptance Criteria

1. THE NavBar SHALL display an "Analytics" tab linking to the `/analytics` route alongside the Models, Playground, and Keys tabs.
2. WHEN the active route path is `/analytics`, THE NavBar SHALL render the Analytics tab in its active visual state.
3. WHEN a user navigates to `/analytics`, THE Analytics_Page SHALL render.

### Requirement 13: Overview Cards Presentation

**User Story:** As a NexusLLM operator, I want overview cards summarizing key metrics, so that I can assess system status at a glance.

#### Acceptance Criteria

1. THE Analytics_Page SHALL render Overview_Cards for Total Requests, Successful requests, Failed requests, Success Rate percentage, Error Rate percentage, Total Input Tokens, Total Output Tokens, Total Tokens, Average Latency, Estimated Cost, Estimated Savings, Active Providers, and Active Models.
2. WHEN the overview data refreshes, THE Analytics_Page SHALL update the rendered Overview_Card values to match the refreshed data.
3. WHILE overview data is being fetched for the first time, THE Analytics_Page SHALL render a Loading_State for the Overview_Cards.
4. WHEN the overview data contains zero requests for the Date_Range, THE Analytics_Page SHALL render the Overview_Cards with zero values.

### Requirement 14: Provider and Model Analytics Presentation

**User Story:** As a NexusLLM operator, I want provider and model analytics displayed on the page, so that I can compare them visually.

#### Acceptance Criteria

1. THE Analytics_Page SHALL render a per-provider section showing, for each provider, the request count, the success rate, the error rate, the average latency, the input token count, the output token count, the total token count, the Estimated_Cost, and the Estimated_Savings.
2. THE Analytics_Page SHALL render a per-model section showing, for each model, the total request count, the successful request count, the failed request count, the success rate, the average latency, the input token count, the output token count, the total token count, the Estimated_Cost, and the Estimated_Savings.
3. WHEN the per-provider data set is empty, THE Analytics_Page SHALL render an Empty_State in the per-provider section.
4. WHEN the per-model data set is empty, THE Analytics_Page SHALL render an Empty_State in the per-model section.

### Requirement 15: Interactive Charts Presentation

**User Story:** As a NexusLLM operator, I want interactive, responsive charts, so that I can understand trends and distributions.

#### Acceptance Criteria

1. THE Analytics_Page SHALL render charts for Requests Over Time, Token Usage Over Time, Input versus Output Tokens, Requests by Provider, Requests by Model, Successful versus Failed requests, Average Latency Trend, Cost Trend, Savings Trend, Provider Distribution, and Error Distribution.
2. WHEN the underlying chart data refreshes, THE Analytics_Page SHALL update the rendered charts to match the refreshed data.
3. WHILE chart data is being fetched for the first time, THE Analytics_Page SHALL render a Loading_State for the charts.
4. WHEN a chart's data set is empty, THE Analytics_Page SHALL render an Empty_State for that chart.
5. WHILE the viewport width changes, THE Analytics_Page SHALL resize the charts to fit the available width.

### Requirement 16: Recent Errors Presentation

**User Story:** As a NexusLLM operator, I want the recent errors displayed, so that I can review failures without leaving the dashboard.

#### Acceptance Criteria

1. THE Recent_Errors_View SHALL display, for each listed error, the provider, the model, the error message, the error type, the HTTP status code, the timestamp, and the request identifier.
2. THE Recent_Errors_View SHALL order the listed errors from most recent to least recent.
3. WHEN there are no recent errors, THE Recent_Errors_View SHALL render an Empty_State.

### Requirement 17: Recent Requests Table Presentation

**User Story:** As a NexusLLM operator, I want a live, interactive requests table, so that I can inspect and navigate request-level detail.

#### Acceptance Criteria

1. THE Recent_Requests_Table SHALL display, for each row, the timestamp, the provider, the model, the user request, the status, the input token count, the output token count, the total token count, the response time, the Estimated_Cost, and the Estimated_Savings.
2. WHEN a user enters a search term, THE Recent_Requests_Table SHALL display only rows matching the search term.
3. WHEN a user selects a sortable column and a sort direction, THE Recent_Requests_Table SHALL display the rows ordered by that column in that direction.
4. WHEN a user changes the page, THE Recent_Requests_Table SHALL display the corresponding page of rows.
5. WHILE request data is being fetched for the first time, THE Recent_Requests_Table SHALL render a Loading_State.
6. WHEN no requests match the applied Filter_Set, THE Recent_Requests_Table SHALL render an Empty_State.

### Requirement 18: Dashboard Filters

**User Story:** As a NexusLLM operator, I want dashboard filter controls, so that I can scope every view to the data I care about.

#### Acceptance Criteria

1. THE Analytics_Page SHALL provide filter controls for Date_Range, provider, model, status, Request_Type, and token-usage range.
2. WHEN a user changes any filter control, THE Analytics_Page SHALL apply the updated Filter_Set to the Overview_Cards, the provider and model sections, the charts, the Recent_Errors_View, and the Recent_Requests_Table.
3. WHEN a user clears the filters, THE Analytics_Page SHALL apply the default Date_Range covering the most recent 24 hours and SHALL remove the provider, model, status, Request_Type, and token-usage constraints.

### Requirement 19: Presentation Consistency, Responsiveness, and Theme Support

**User Story:** As a NexusLLM operator, I want the Analytics_Page to match the existing dashboard design and adapt to my environment, so that the experience is cohesive and usable.

#### Acceptance Criteria

1. THE Analytics_Page SHALL use the existing dashboard visual conventions, including rounded-3xl cards, the `border-white/[0.06]` border treatment, and the `bg-bg-secondary/50` surface treatment.
2. WHILE the active theme is light mode or dark mode, THE Analytics_Page SHALL render its surfaces, text, and charts using that theme's tokens.
3. WHILE the viewport is at a narrow width, THE Analytics_Page SHALL render its sections in a single-column layout.
4. WHEN any analytics data request fails, THE Analytics_Page SHALL render a descriptive error message for the affected section.
