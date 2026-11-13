---
type: doc
status: draft
tags: [supabase, handover, data-layer, rls, rpc, edge-functions, outbox]
relatedTo: []
---

# Supabase handover

Every function in the data layer (`src/data`), what it does today on mock data, and what it becomes when Supabase is connected. Screens only use the hooks in `src/data/hooks.ts`, so replacing the function bodies needs no UI changes. See [netsuite-mapping.md](netsuite-mapping.md) for the records behind each table.

Project: **McWorkshop** (`xckqgweflvfstbvppmsy`). Live tables: the vehicle library (see below) and the role tables `profiles` and `user_roles` that were applied outside the repo on 10/11/2026. Everything else is still mock data. One Edge Function is live: `customers-list` (see below).

## Vehicle library (live)

Migration `20261112000000_vehicle_library.sql`. Tables: `vehicle_makes`, `vehicle_models`, the lookups `vehicle_classes` and `vehicle_fuel_types`, and `sync_runs`. View: `vehicle_library` (security invoker), the list the Admin, Vehicle library screen reads with `.range()` pagination. The prototype's `VehicleModel` maps to a `vehicle_library` row.

**Who owns which column.** The sync overwrites only its own columns on `source = 'netsuite'` rows. It never touches the app owned ones.

| Table | Sync owned | App owned |
|---|---|---|
| `vehicle_makes` | `name`, `abbreviation`, `is_active`, `netsuite_modified_at`, `last_synced_at` | none |
| `vehicle_models` | `name`, `base_model`, `make_id`, `abbreviation`, `is_active`, `netsuite_modified_at`, `last_synced_at` | `family`, `series`, `year_from`, `year_to`, `vehicle_class`, `fuel_type`, `engine`, `notes` |

**Functions (live).** Both use `withApiKey` and the service role, and the screen calls them through `src/data/live-library.ts`.
- `vehicle-library-sync` (POST, `{ "dryRun": true }` to preview). Reads the two NetSuite record lists, then calls the database function `sync_vehicle_library` in one transaction. Records a `sync_runs` row. First live run on 12/11/2026: 62 makes and 587 models inserted, 4 models skipped, and a repeat run inserted nothing. The database function refuses an empty list so a bad fetch cannot deactivate the library, and only the service role may run it.
- `vehicle-library-list` (POST). One page of `vehicle_library` with search, make, type, fuel, status and source filters, plus the filter lists and summary figures. Search words are cleaned to letters, digits, spaces and a few joiners before they reach the query. Page size is capped at 100.
- `vehicle-library-enrich` (POST, `{ "dryRun": true }` to preview). Fills type, fuel and years from workshop history using four aggregate SuiteQL queries (counts by model, no customer data). Migration `20261112020000_vehicle_library_history.sql` adds `vehicle_count`, `evidence_vehicles` and `attributes_source`, and the database function `apply_vehicle_library_history`. Rules: the past job type ("4WD Vehicle Service" or "Passenger Car Service") is the strongest class signal and the (DIESEL) or (PETROL) in it votes for fuel. Clear body types (hatch, sedan, coupe, van, cab chassis, single cab) are secondary, and ambiguous bodies such as wagon and dual cab count against the share. Class needs 2 votes and 75 to 80 percent agreement, fuel needs 2 votes and 80 percent. Years are the lowest and highest seen, ignoring a lone outlier, and the end year stays open for models seen in 2022 or later. Anything that fails a rule stays empty. Rows with `attributes_source = 'manual'` are never overwritten, and `history` rows are refreshed on each run. The edit function must set `manual`.
- Coverage on 12/11/2026: 20,544 customer vehicles, 20,056 linked to a model (98 percent), all of them matched to a synced model. Type was set on 255 of 557 active models, which covers 16,809 of 19,084 vehicles (88 percent). Fuel was set on 264 and years on 556. Fuel on the vehicle records is filled for only 19 percent of vehicles and body type for 37 percent, with typos such as DESIL and MANAUL.
- Research layer. Migration `20261112030000_vehicle_library_research.sql` adds `attributes_source = 'research'`, the database function `apply_vehicle_library_research` (service role only) and `notes` on the view. On 12/11/2026 AI agents with web search researched every model and 298 were loaded, covering 18,940 of 20,056 vehicles. Precedence is manual, then research, then history. The history refresh no longer overwrites research rows. The raw answers and sources are in `discovery/research/`. Only high and medium confidence rows were loaded.
- Migration `20261112010000_vehicle_library_sync.sql` adds the database function, `vehicle_make_summary` and `base_model` on the view.
- The Admin, Vehicle library screen is read only for now. It has an Update from back office button (catalogue editors). Editing class, fuel, years and engine needs a write function, which is the next step. Service profiles still attach to the demo library until they move to Supabase too.

**Rules the sync function follows:**
- Upsert on `netsuite_id` (unique, partial). Trim every name first, because the tables reject untrimmed names.
- Do not rely on `(make, name)` being unique. NetSuite holds duplicates such as two "RANGER RAPTOR" rows.
- Skip models with no make and count them in `sync_runs.skipped`. There are 4 today.
- Set `is_active = false` for NetSuite rows missing from a full fetch.
- A model's `vehicle_class` is empty after the first sync. The view exposes that as `needs_review`.
- Insert a `sync_runs` row at the start and close it at the end. Counts and error codes only.

**Access.** Row level security is on everywhere. Staff read (any user holding a row in `user_roles`). No policy lets a signed in user write, so every change goes through an RPC or Edge Function that checks the role, as listed under the data functions. `sync_runs` has no policy, so only the service role reads or writes it. `anon` has no access. Checked on 12/11/2026: anon read and any signed in write are denied, a role holder reads, and a user with no role sees nothing.

**Not yet in the schema.** Individual customer vehicles (`vehicles`). They hold customer data and need their own RLS. They will reference `vehicle_models` by id. NetSuite's vehicle fuel, body and transmission fields are free text with typos ("DESIL", "MANAUL"), so normalise them on import. Do not copy them across.

**Open items on the existing role tables** (not changed by this work):
- The `app_role` enum is admin, manager, mechanic and executive. The app uses Advisor, Workshop Controller, Mechanic, Manager and Administrator. The two sets need reconciling before real sign in.
- `handle_new_user` gives every new sign up the `mechanic` role. If public sign up is on, anyone can register and gain that role, which also grants library read. Turn off public sign up or invite staff only.
- `anon` and `authenticated` hold full table grants on `profiles` and `user_roles`. RLS limits them, but trim the grants when those tables are next changed.
- The repo files `20261110114239_roles_and_profiles.sql` and `20261110114320_roles_and_profiles_security.sql` are rebuilt from the live definitions so the migration history matches. Their split between the two files is a guess.

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

`customers`, `vehicles`, `technicians`, `technician_unavailability`, `bays`, `service_templates`, `bookings`, `booking_technicians`, `job_cards`, `labour_lines`, `parts_lines`, `checklist_items`, `findings`, `finding_photos`, `quote_lines`, `time_entries`, `job_notes`, `invoices` (synced, read only), `activity_events` (append only), `outbox`, `staff_profiles` (role, title, active, technician link), `role_permissions` (role, action), `workshop_settings` (single row), `closed_days`, `vehicle_models` (the vehicle library), `service_profiles`.

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
| `getServiceTemplates` | Table select | `service_templates` where division is servicing. Now carries `interval_km`, `vehicle_class`, `fuel`, `notes` and `active` | Price columns hidden from mechanics |
| `getRolePermissions` | Table select | `role_permissions` grouped by role | All staff read (the app needs it to hide screens). Admin write only |
| `getWorkshopSettings` | Table select | `workshop_settings` plus `closed_days` | All staff read. Admin write only |
| `getVehicleLibrary` | View select, paginated | `vehicle_library` (live). Filled by the NetSuite sync once built, with a manual add for gaps | Staff read. Writes by RPC for catalogue editors |
| `getServiceProfiles` | Table select | `service_profiles` | Office roles read. Catalogue editors write. Price columns hidden from mechanics |
| `getServicePlan` | RPC `service_plan(vehicle_id, template_id)` | Match the vehicle to a `vehicle_models` row, return the active profile for that model and template or fall back to the generic template. The matching in `src/lib/service-profiles.ts` is a prototype stand in: real vehicles will carry a `vehicle_model_id` | Office roles |
| `getServiceActuals` | View `service_actuals` | Average closed time entry hours per template and per profile, finished jobs only | Office roles |
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
| `createBooking` | RPC `create_booking` | Insert booking and job card from a template (or the vehicle's service profile when one matches, using the settings labour rate), check conflicts, role checked override | Create case and task |
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
| `saveStaffMember` | RPC `save_staff_member` (service role for the Auth user) | Create or update a person, their role, title and active flag, and their technician row. Refuses to demote or deactivate yourself or the last active administrator | None. App only |
| `saveRolePermissions`, `resetRolePermissions` | RPC, admin only | Replace the actions for a role. Administrators are always full and `admin.users` and `integration.view` stay administrator only | None. App only |
| `saveWorkshopSettings`, `applyHoursToTechnicians` | RPC, admin only | Default hours, break, daily target per technician, labour rate (integer cents ex GST). Validates that the target fits the working day | None. App only |
| `addClosedDay`, `removeClosedDay` | RPC, admin only | Public holidays and shutdowns. Returns how many bookings already sit on the day | None. App only |
| `saveBay`, `removeBay` | RPC, admin only | Create, rename, retype. Removal refused while upcoming bookings use the bay | None. App only |
| `saveVehicleModel`, `removeVehicleModel` | RPC, catalogue editors | Library entry. Refuses duplicates and deletion while profiles use it | Reads sync in from NetSuite later. Manual rows stay local |
| `saveServiceTemplate`, `removeServiceTemplate` | RPC, catalogue editors | Generic template. Removal refused once a booking or profile uses it (make it inactive) | None. App only |
| `saveServiceProfile`, `removeServiceProfile` | RPC, catalogue editors | One profile per template and model. Hours, parts, optional checklist, notes | None. App only |
| `retrySync` | Edge Function `retry-outbox` | Requeue one failed outbox row | Resend |
| `setErrorSimulation`, `resetDemo` | Removed | Demo controls only | |

## Edge Functions to build

| Function | Purpose |
|---|---|
| `netsuite-sync` | Scheduled SuiteQL pulls into the synced tables. Read only. First integration milestone |
| `outbox-worker` | Sends pending outbox rows with a throttled queue, backoff with jitter, idempotency keys and correlation IDs. Reads `NETSUITE_WRITE_MODE` and logs the payload without sending unless it is `live` |
| `retry-outbox` | Admin only manual retry |

## Auth

Mock sign in (`src/auth/session.ts`) becomes Supabase Auth. `StaffUser` maps to `staff_profiles`. `can()` in `src/auth/permissions.ts` stays as a UI convenience only. The permission matrix is data (`role_permissions`), so the RPCs must check it server side. Administrators always have every permission, and `admin.users` and `integration.view` are administrator only. The real checks are RLS and the RPCs.

## Storage

Finding photos are data URLs in the prototype. They become objects in a private `finding-photos` bucket, with signed URLs for display and the same downscaling on the device before upload (`readPhoto` in `src/features/mechanic/bits.tsx`).
