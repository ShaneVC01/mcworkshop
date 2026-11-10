# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository is pre-implementation. It contains only [docs/PRD.md](docs/PRD.md), the product requirements for **McCormack Workshop OS**. There is no source code, package manifest, build, lint or test tooling yet, and no git repository. Do not invent commands. When scaffolding begins, add the real commands here.

Read the PRD before building anything. It is the single source of truth and ends with a "Final build specification for the coding agent" section that serves as the build brief. Ignore the `citeturn...` markers scattered through the PRD, which are citation artefacts rather than content.

## What is being built

A responsive web app that replaces the day to day Oracle NetSuite Field Service Management (FSM) experience for McCormack 4x4, an automotive workshop. **NetSuite stays the system of record** for accounting, inventory, billing and durable records. The app is an operational UI over it. Three experiences:

- **Workshop Planner**: resource timeline calendar (mechanics as rows, time horizontal), booking, capacity and the Workshop command board (status columns).
- **Service Advisor Workspace**: registration and customer search, service templates, quoting, approvals, vehicle timeline.
- **Mechanic Workspace**: tablet first, touch only shell (My Day, Current Job, Completed) with checklists, findings, photos and time tracking.

Users must only ever see customers, registrations, vehicles, technicians, bays, service operations and workshop hours. No ERP or NetSuite terminology in the UI, except an explicit "Open NetSuite" link and the admin integration diagnostics.

## Architecture rules that span the codebase

- **The browser never calls NetSuite.** UI calls a Workshop Application API, which holds auth/RBAC, domain services (booking and capacity engines), audit log, cache, and a sync outbox with a job queue. A server side NetSuite adapter sits behind that.
- **Provider abstraction is mandatory.** All frontend code works only against the canonical `WorkshopERPProvider` interface (defined in the PRD). Two implementations are required: `MockWorkshopProvider` and `NetSuiteWorkshopProvider`. The app must run entirely on mock data, and swapping providers must not require UI changes. No NetSuite record types, field names or internal IDs may appear in React components.
- **Canonical domain model** (Customer, Vehicle, Technician, Bay, Booking, WorkshopJob, LaborOperation, ChecklistItem, Finding, Quote, TimeEntry, ActivityEvent) is defined in the PRD. Registration number is the display identifier for vehicles, but a durable ID (such as the NetSuite internal ID) is the integration key.
- **Local read model.** Reads come from a local projection or cache, never straight from NetSuite on each calendar pan or filter. Writes validate, persist the intent or event, send to NetSuite, confirm, then update the projection. A failed NetSuite write must be visible and retried, never silently dropped. The UI shows local save and NetSuite sync status separately.
- **NetSuite integration pathways.** Classify each operation as (A) standard SuiteTalk REST record, (B) SuiteQL read model, or (C) a custom RESTlet for FSM specific behaviour (start or finish work, service reports, task team assignment, time tracking). Prefer A and B. Do not assume undocumented FSM internals are a stable API, and do not write FSM completion fields directly, because completion has side effects such as creating time bills.
- **Field mappings are unconfirmed.** The PRD's mapping table (Vehicle to FSM Asset or custom record, Booking to Task or custom record, and so on) is explicitly "to be confirmed" against the real McCormack account. Keep every mapping in the adapter layer, behind configuration.
- **Integration robustness.** OAuth 2.0 only (no username/password or TBA), with secrets server side. Use a bounded concurrency queue, exponential backoff with jitter on HTTP 429, external IDs and idempotency keys, correlation IDs, and a structured integration error log (fields listed in the PRD).
- **Explicit job state machine.** `BOOKED`, `CONFIRMED`, `CHECKED_IN`, `READY_FOR_WORK`, `IN_PROGRESS`, `WAITING_APPROVAL`, `WAITING_PARTS`, `BLOCKED`, `TECH_COMPLETE`, `QUALITY_CHECK`, `READY_FOR_CUSTOMER`, `CLOSED`. Every state change writes an immutable `ActivityEvent`. Finding approval status is independent of overall job status, so authorised work can continue while other work awaits approval.
- **Capacity maths.** Available = shift minus breaks, leave, training and blocked time. Free = Available minus Booked. Utilisation = Booked / Available. Technician availability and bay availability are separate constraints, and double booking a mechanic needs an explicit authorised override.
- **Roles:** Advisor, Workshop Controller, Mechanic, Manager, Administrator. The permission matrix is in the PRD. Mechanics must not see profitability figures unless enabled.

## Recommended stack (from the PRD, a recommendation not a mandate)

Next.js, React, TypeScript, Tailwind, shadcn/ui, TanStack Query, FullCalendar Scheduler (or an equivalent resource timeline), React Hook Form with Zod, PostgreSQL with Prisma, optional Redis, Microsoft Entra ID or OIDC for auth, and an object storage abstraction for photos. The PRD states that the architectural separation matters more than the framework choice.

## Planned routes

`/today`, `/calendar`, `/bookings/new`, `/bookings/:id`, `/workshop`, `/vehicles/:id`, `/mechanic`, `/mechanic/jobs/:id`, `/mechanic/jobs/:id/inspection`, `/mechanic/jobs/:id/findings/new`, `/reports`, `/admin/integration`.

## Constraints to keep in mind

- **Mechanic UI:** 48 px or larger touch targets, no hover dependent interaction, no nested menus, registration visible on every job screen, checklist autosave (no page level Save), at most two taps from job screen to finding capture, portrait tablet first. Required checklist items must block job completion.
- **Colour is never the only signal.** Calendar and board states need text or icons too (colour semantics are tabulated in the PRD).
- **Out of scope for the first prototype:** accounting, GL, procurement, payroll, full inventory, payments, full CRM, manufacturer repair data, parts catalogue integrations, AI scheduling, customer self booking and invoicing replacement. Offline mechanic mode is also deferred.
- **Seed data:** six mechanics, four bays, twenty 4x4 vehicles, thirty bookings across a week, technician leave and one absence, one over capacity day, unassigned jobs, parts waiting and approval waiting jobs. Do not present demo service schedules as accurate manufacturer data.
- **Prototype done test:** the 20 step end to end scenario in the PRD (search "923XYZ", book a 120,000 km service, mechanic executes, brake finding, additional work quote and approval, tech complete, vehicle timeline). A standard booking should take under a minute.
- **Spelling:** the product copy uses Australian English (for example "labour", "utilisation"), but the PRD's type definitions use `laborHours` style identifiers. Follow the PRD's identifiers in code.
