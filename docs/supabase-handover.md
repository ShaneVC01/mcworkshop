---
type: doc
status: draft
tags: [supabase, handover, data-layer, rls, rpc, edge-functions, outbox]
relatedTo: []
---

# Supabase handover

Every function in the data layer (`src/data`), what it does today on mock data, and what it becomes when Supabase is connected. Screens only use the hooks in `src/data/hooks.ts`, so replacing the function bodies needs no UI changes. See [netsuite-mapping.md](netsuite-mapping.md) for the records behind each table.

Project: **McWorkshop** (`xckqgweflvfstbvppmsy`). No tables or policies exist yet. One Edge Function is live: `customers-list` (see below).

## Edge Functions (NetSuite backed API endpoints)

Each business use case is its own Edge Function, a custom API endpoint that calls one or more NetSuite REST APIs underneath. The workshop app and other applications call them over HTTPS with our API key.

### Live

| Function | Method | What it does | NetSuite calls |
|---|---|---|---|
| `customers-list` | GET or POST, optional `limit` 1 to 100 (default 25) | The most recently created active customers, in our own customer shape | Token (cached), one SuiteQL query. Read only |

### Contract shared by every function

- URL: `https://xckqgweflvfstbvppmsy.supabase.co/functions/v1/<function>`.
- Header `x-api-key: <EDGE_API_KEY>` is required. Supabase's own JWT check is off for these functions (`verify_jwt = false` in `supabase/config.toml`) because our key is the guard. The key is checked before anything touches NetSuite.
- Success: `{ ok: true, data, meta: { correlationId, durationMs, netsuiteRequests, ... } }`.
- Failure: `{ ok: false, error: { code, message }, meta: { correlationId, ... } }`. Codes: `unauthorised` 401, `bad_request` 400, `method_not_allowed` 405, `write_blocked` 403, `not_configured` 500 (names the missing secrets), `netsuite_auth_failed` 502, `netsuite_error` 502 (includes NetSuite's error code), `netsuite_busy` 503, `timeout` 504, `internal_error` 500.
- Send `x-correlation-id` to trace a call across systems. Otherwise one is generated and returned in the `x-correlation-id` header and in `meta`.
- Responses use our field names, never NetSuite's.

### Shared building blocks (`supabase/functions/_shared`)

- `http/api-key.ts`: `withApiKey({ name, methods }, handler)` wraps every function (CORS preflight, method check, key check, error envelope). `readParams(req)` merges query string and JSON body.
- `http/response.ts`: envelope, `EdgeError`, CORS, structured logs (metadata only).
- `netsuite/config.ts`: reads and validates the `NETSUITE_*` secrets.
- `netsuite/auth.ts`: OAuth 2 client credentials. Signs a 5 minute JWT (PS256 for RSA, ES256 for EC, `kid` is the certificate ID, scope `rest_webservices`), swaps it for an access token, caches the token per instance until 2 minutes before expiry, and shares one token request between concurrent calls.
- `netsuite/client.ts`: `netsuiteFetch` is the only way to call NetSuite. Concurrency cap, retry on 429 and 5xx with exponential backoff and jitter (honours `Retry-After`), one token refresh on 401, 25 second timeout, logs status codes only.
- `netsuite/suiteql.ts`: `runSuiteQL(ctx, query, { limit, offset })`.
- `netsuite/write-guard.ts`: `guardWrite(fn, payload)` returns `live` only when `NETSUITE_WRITE_MODE` is `live`, otherwise the payload that would have been sent.

### Adding a new endpoint

1. Create `supabase/functions/<kebab-case-business-action>/index.ts` with `Deno.serve(withApiKey({ name, methods }, async (ctx) => ({ data, meta })))`.
2. Call NetSuite only through `_shared/netsuite`. Map results to our own field names.
3. Anything that changes NetSuite calls `guardWrite` first and needs Shane's approval before `NETSUITE_WRITE_MODE` is set to `live`.
4. Add `[functions.<name>]` with `verify_jwt = false` to `supabase/config.toml`.
5. Deploy: `supabase functions deploy <name> --project-ref xckqgweflvfstbvppmsy --use-api`.
6. Add a business named function in `src/data` that calls it through `callEdgeFunction` (`src/data/edge.ts`), and list it in this file.

### Notes from the first live run (11/11/2026)

- Token and SuiteQL both work. A first call takes about 1.5 to 2 seconds (token plus query). Later calls on a warm instance take about 0.6 seconds with one NetSuite request.
- NetSuite's SuiteQL `totalResults` is capped relative to the page size (25,000 with a limit of 25), so it is not used as a total. Only `hasMore` is returned.

## Shape to keep

- Every function returns `Result<T>`: `{ data, sync }` where `sync.status` is `synced`, `pending` or `failed`.
- Reads come from Supabase tables that are synced from NetSuite. They never call NetSuite.
- Writes are one RPC or Edge Function per business action. Each one, in a single transaction: validates, changes our tables, inserts an `activity_events` row, and inserts an `outbox` row. A separate worker sends the outbox to NetSuite (dry run by default).
- `useLiveData()` currently listens to the mock store. It becomes a Supabase Realtime subscription that invalidates the same query keys.

## Proposed tables

`customers`, `vehicles`, `technicians`, `technician_unavailability`, `bays`, `service_templates`, `bookings`, `booking_technicians`, `job_cards`, `labour_lines`, `parts_lines`, `checklist_items`, `findings`, `finding_photos`, `quote_lines`, `time_entries`, `job_notes`, `invoices` (synced, read only), `activity_events` (append only), `outbox`, `staff_profiles` (role, technician link).

Each synced table carries `netsuite_id`, `sync_status`, `last_synced_at` and `division`.

## RLS outline

- All tables: authenticated staff only. No anonymous access.
- Role comes from `staff_profiles`, read through a `security definer` helper such as `current_role()`.
- Mechanics: read their own bookings and job cards (through `booking_technicians`), write only through the job RPCs. No access to money columns (use views without price columns).
- Advisor, controller, manager, admin: read everything operational. Booking moves and quotes through RPCs.
- `activity_events`: insert only through RPCs, no update or delete for anyone.
- `outbox` and integration diagnostics: admin read only. Written by RPCs and the worker (service role).
- Double booking override: checked inside the RPC against the caller's role, not in the UI.

## Reads (`src/data/queries.ts`)

| Function | Becomes | Intended query | RLS notes |
|---|---|---|---|
| `getStaff` | Removed | Replaced by Supabase Auth sign in | |
| `getTechnicians` | Table select | `technicians` with unavailability | All staff |
| `getBays` | Table select | `bays` | All staff |
| `getServiceTemplates` | Table select | `service_templates` where division is servicing | Price columns hidden from mechanics |
| `searchEverything` | RPC `search_everything(q)` | Trigram search over rego, VIN, customer name, mobile, booking and job numbers | Office roles |
| `getVehicles`, `getVehicle` | View `vehicle_details` | Vehicle, customer, last visit, next booking, current job | Office roles |
| `getVehicleTimeline` | View `vehicle_timeline` | Jobs for a vehicle with findings, newest first | Office roles |
| `getSchedule` | View `scheduled_jobs` | Bookings in a date range joined to job, vehicle, customer, technicians, bay | Office roles |
| `getCapacity` | RPC `capacity_for_days(days[])` | Available, confirmed, tentative and free hours per technician per day | Office roles |
| `findAvailability` | RPC `find_availability(hours, skill, bay_type, from_day)` | Contiguous free time for a skilled technician with a free bay | Office roles |
| `getBookings` | View `scheduled_jobs` | All, newest first, paged | Office roles |
| `getBooking`, `getJobCard` | View `scheduled_jobs` by booking or job ID | One row with children | Mechanics: own jobs only |
| `getWorkshopBoard` | View `scheduled_jobs` filtered | The day's jobs, anything on site, anything finished today | Office roles |
| `getMyDay` | View `scheduled_jobs` filtered | Bookings for `auth.uid()`'s technician on a day | Own jobs only |
| `getCompletedJobs` | View `scheduled_jobs` filtered | Finished jobs for the technician | Own jobs only |
| `getQuote` | View `job_quotes` | Booked totals, additional lines, approved totals, awaiting amount | Office roles. Not mechanics |
| `getInvoiceSummary` | Table select | `invoices` by job | Read only for office roles |
| `getActivity` | Table select | `activity_events` by job, newest first | Office roles |
| `getTodaySummary` | RPC `today_summary(day)` | Counts, capacity, jobs needing attention, idle technicians | Office roles |
| `getUtilisationReport` | RPC `utilisation_report(from, to)` | Hours by day and technician, on time rate, approval wait | Controller, manager, admin. Limited for advisor |
| `getSyncLog` | Table select | `outbox`, newest first | Admin only |

## Writes (`src/data/actions.ts`)

| Function | Becomes | What it does | NetSuite effect (dry run by default) |
|---|---|---|---|
| `createCustomer` | RPC | Insert customer | Create customer |
| `createVehicle` | RPC | Insert vehicle, reject duplicate rego | Create vehicle record |
| `createBooking` | RPC `create_booking` | Insert booking and job card from a template, check conflicts, role checked override | Create case and task |
| `rescheduleBooking` | RPC `reschedule_booking` | Move, resize, reassign or unassign, check conflicts | Update task dates and assignee |
| `confirmBooking` | RPC | Tentative to confirmed | Update status |
| `cancelBooking` | RPC | Cancel a booking that has not arrived | Cancel or close case |
| `checkInVehicle` | RPC | Status to checked in, record odometer | Update status and odometer |
| `moveJobStatus` | RPC `move_job_status` | Validate against the transition map, stop the clock on holds | Update status |
| `startJob`, `pauseJob`, `resumeJob` | RPCs | Open and close time entries, status to in progress | **Edge Function and RESTlet.** FSM time tracking has side effects |
| `updateChecklistItem` | RPC | Autosave one item | Probably none. Summary only on completion |
| `addFinding` | RPC plus Storage upload | Insert finding, link to checklist item, store photos in a private bucket | Optional case note |
| `addPartUsed`, `setPartUsed` | RPC | Record parts usage | Parts usage posting, to be confirmed |
| `setLabourDone` | RPC | Mark a work item done | None |
| `addJobNote` | RPC | Insert note | Optional case note |
| `completeJob` | RPC `complete_job` then Edge Function | Check required checklist items, close time entry, status to tech complete, update odometer | **Edge Function and RESTlet.** FSM completion creates time bills |
| `addFindingToQuote` | RPC | Insert draft quote line | None until sent |
| `sendQuoteForApproval` | RPC | Line to awaiting customer | Create or update estimate |
| `approveQuote` | RPC `approve_quote` | Line to approved, add labour and parts lines, extend the booking | Update estimate, add task time |
| `declineQuote` | RPC | Line to declined | Update estimate |
| `retrySync` | Edge Function `retry-outbox` | Requeue one failed outbox row | Resend |
| `setErrorSimulation`, `resetDemo` | Removed | Demo controls only | |

## Edge Functions to build

| Function | Purpose |
|---|---|
| `netsuite-sync` | Scheduled SuiteQL pulls into the synced tables. Read only. First integration milestone |
| `outbox-worker` | Sends pending outbox rows with a throttled queue, backoff with jitter, idempotency keys and correlation IDs. Reads `NETSUITE_WRITE_MODE` and logs the payload without sending unless it is `live` |
| `retry-outbox` | Admin only manual retry |

## Auth

Mock sign in (`src/auth/session.ts`) becomes Supabase Auth. `StaffUser` maps to `staff_profiles`. `can()` in `src/auth/permissions.ts` stays as a UI convenience only. The real checks are RLS and the RPCs.

## Storage

Finding photos are data URLs in the prototype. They become objects in a private `finding-photos` bucket, with signed URLs for display and the same downscaling on the device before upload (`readPhoto` in `src/features/mechanic/bits.tsx`).
