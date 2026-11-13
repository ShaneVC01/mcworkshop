---
type: doc
status: draft
tags: [netsuite, mapping, suiteql, domain-model, integration, fsm]
relatedTo: []
---

# NetSuite mapping

How each entity in our domain model (`src/types/index.ts`) is expected to map to NetSuite. The table below is the original expectation and is **unconfirmed** unless the next section says otherwise. A read only discovery of the McCormacks account on 11/11/2026 confirmed the records in the next section. No mapping may be hard coded outside the integration layer (Supabase Edge Functions).

## Confirmed by discovery (11/11/2026)

Full findings and numbers are in [discovery/PROFILE.md](../discovery/PROFILE.md). Where this section and the table below disagree, this section wins.

| Our entity | Confirmed NetSuite home | Notes |
|---|---|---|
| Job card | **Case** (`supportcase`), one per vehicle visit | Statuses are only Not Started, In Progress, For Billing and Closed. Case type (Service, Repair, Accessory Fitment, Tyres), job subtype, department and estimated effort are on the case. The linked sales order is `custevent_nx_case_transaction` and the vehicle is `custevent_nx_case_asset` |
| Booking | **FSM task** (standard `task` table with `custevent_nx_*` fields) under the case, assigned to an employee | Task statuses are NOTSTART, PROGRESS and COMPLETE. Task type is "Workshop". Daily estimated hours are on the task |
| Job status | Case status plus task status | Only four stages exist. Waiting approval, waiting parts, checked in and quality check are not recorded |
| Vehicle | `customrecord_nx_asset` (20,532 records) | VIN, year, fuel, body, transmission, odometer unit, next service date. Make and model are `customrecord_ajg_make` and `customrecord_ajg_make_model`. The sales order also carries rego, VIN and odometer as body fields |
| Technician | `employee` | Title examples: Fitter, Mechanic, Auto Electrician, Spray Painter. No employee is flagged as a job resource |
| Quote | `estimate`, converting to `salesorder` | Link type `EstInvc` |
| Labour line and parts line | Lines on the sales order | Labour is sold as non inventory items (LAB4WD, LAB, LABELEC). Parts are inventory items, often special ordered through a purchase order per job |
| Time entry | `timebill`, created by FSM | Hours only. Every one uses "Workshop Labour *DO NOT USE*" and none are billable. Never write these directly |
| Invoice | `invoice`, then `customerpayment` | Sales order to invoice is link type `OrdBill`. Read only |
| Division | Department on the case | Mechanical holds Service, Repair and Tyres. McCormack's 4WD holds Accessory Fitment |

### Admin catalogue and settings (added with the Admin section)

| Our entity | NetSuite home | Direction |
|---|---|---|
| Vehicle library (`VehicleModel`) | `customrecord_ajg_make` (62 records) and `customrecord_ajg_make_model` (591 records, 30 inactive). A model's make is `custrecord_make`. The model name is `name`, and `custrecord_agj_model` sometimes holds the base model ("FORTUNER" for "FORTUNER GXL") | **Read**. Tables `vehicle_makes` and `vehicle_models` are live and empty until the sync is built. Class, fuel, years and engine are not in NetSuite, so staff set them. Names are not unique per make, 4 models have no make and some names carry stray spaces |
| Service profile and generic template | None. NetSuite has no service schedule. Labour sells as non inventory items (LAB4WD, LAB, LABELEC) and parts as inventory items | **App only**. A booking sends the work list as lines in the case details text |
| Labour rate | The labour items' price, which differs by division | Read for reference. The app's rate is its own setting |
| Staff, roles, permissions | Employee for identity matching only. Bays also exist as employee style records | **App only**. Do not import bay records as people |
| Workshop hours, daily target, closed days | The FSM work calendar and non working day records | **App only** for now. Read the calendar later if staff already maintain it there |

Direction: **Read** means synced from NetSuite into Supabase with SuiteQL. **Write** means sent from our outbox to NetSuite. All writes default to dry run and need explicit approval before going live (see [CLAUDE.md](../CLAUDE.md) and [env.md](env.md)).

## Entities

| Our entity | Likely NetSuite record | Likely fields | Direction | To confirm |
|---|---|---|---|---|
| Customer | `customer` | **Confirmed by SuiteQL on 11/11/2026:** `id`, `entityid`, `isperson`, `companyname`, `firstname`, `lastname`, `email`, `phone`, `mobilephone`, `datecreated`, `isinactive`. Still to check: default address postcode | Read (live through `customers-list`). Write for new customers created at booking | **Findings:** all 100 most recent active customers are records with `isperson` false, so individuals are stored as companies and the person's name sits in `companyname`. `mobilephone` was empty on all 100 and `phone` holds the number. About 20 in 25 have an email. `datecreated` comes back as DD/MM/YYYY text |
| Vehicle | FSM Asset (`customrecord_nx_asset`) or a McCormacks custom vehicle record | Rego, state, VIN, make, model, year, odometer, customer link | Read. Write for new vehicles and odometer updates | Which record holds vehicles, field IDs for rego and VIN, where make and model live |
| Technician | `employee` flagged as an FSM resource | `id`, name, active flag, work calendar | Read | How skills are recorded, if at all. Shift hours and leave source |
| Technician unavailability | Time off or calendar events against the employee | Date range, type | Read | Where leave and training are recorded |
| Bay | Custom list or custom record | Name, type | Read | Whether bays exist in NetSuite. May stay app only |
| Service template | Service items, item groups or FSM task templates | Name, labour hours, default parts, price | Read | How canned jobs are modelled today. Checklist content may stay app only |
| Booking | CRM task or project task under an FSM case (`supportcase`) | Start, end, assigned employee, case link, status | Read and write | Exact case to task relationship, which record carries the scheduled time |
| Job card | FSM case plus its tasks | Case number, status, asset link, customer link | Read and write | Status list and how it maps to our 12 job states |
| Job status | Case status or FSM task status | Status ID | Read and write | Mapping table. Some of our states may have no NetSuite equivalent and stay app only |
| Labour line | Service item lines on the estimate or sales order | Item, quantity (hours), rate | Read. Write for approved additional work | Labour rate source, which transaction is used |
| Parts line | Inventory item lines on the estimate or sales order | Item, quantity, rate, quantity used | Read. Write for parts used | How parts usage is posted (fulfilment, FSM consumption) |
| Checklist and inspection | FSM subtasks or custom records | Item label, result, reading | Write, if it is recorded in NetSuite at all | Whether inspection results need to live in NetSuite or only a summary |
| Finding | Case note or custom record, plus file attachments | Text, severity, photos | Write | Whether findings need to be in NetSuite beyond the quote lines they create |
| Photo | File Cabinet file attached to the case | Folder, file | Write | Folder convention. Photos may stay in Supabase Storage with a link |
| Quote and quote line | `estimate` | Lines, totals, status | Read and write | Whether additional work is a new estimate or added lines |
| Customer approval | Estimate status or custom field | Status, approved date | Write | How approval is recorded today |
| Time entry | `timebill` created through FSM time tracking | Employee, case or task, start, end, duration | Write | **High risk.** FSM creates time bills as a side effect of task completion. Must go through a supported RESTlet, never direct field writes |
| Job completion | FSM task completion | Completion time, employee, summary, odometer | Write | **High risk.** Completion triggers FSM processing. Needs a controlled RESTlet |
| Invoice | `invoice` | Number, status, totals, tax | **Read only** | Nothing is ever written. The app shows a summary only |
| Activity event | None | | App only | Our audit trail. Used to reconcile against NetSuite, never sent |
| Staff user and role | NetSuite employee for identity matching only | Employee ID | Read | Roles and permissions are ours, enforced by Supabase |

## Integration pathways

Each operation is classed as one of three, in order of preference:

- **A. SuiteTalk REST record API** for standard record reads and writes.
- **B. SuiteQL** through the REST query service for all sync reads.
- **C. Custom RESTlet** only where FSM behaviour must be triggered safely (starting and finishing work, time tracking, service reports, task assignment).

Do not rely on undocumented FSM SuiteApp internals as a stable API, and do not write FSM completion fields directly.

## Sync rules

- Reads: scheduled SuiteQL pulls into Supabase tables, keyed by NetSuite internal ID. The app never queries NetSuite on screen load.
- Writes: outbox table, one row per business action, sent by an Edge Function with an idempotency key (our row ID as external ID), bounded concurrency, and exponential backoff with jitter on HTTP 429.
- Every row carries `sync_status` (`synced`, `pending` or `failed`), which the UI shows as Saved, Saving or Not saved, retrying.
- Registration is what staff see. The NetSuite internal ID is the integration key and never appears in the UI.

## Discovery checklist (read only, before any mapping is trusted)

1. Which record holds vehicles and how it links to customers.
2. The case and task structure FSM uses for a workshop job.
3. Status lists for cases and tasks.
4. How estimates, sales orders and invoices chain for a service job.
5. Where technician calendars, leave and skills live.
6. How parts usage and technician time are posted today.
7. Account concurrency limit (governs `NETSUITE_MAX_CONCURRENCY`).
