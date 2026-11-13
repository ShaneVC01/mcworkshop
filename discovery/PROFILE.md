---
type: summary
status: draft
tags: [netsuite-discovery, process-profile, fsm, support-case, workshop-task, estimate, sales-order, time-bill, vehicle-asset, integration-decisions]
relatedTo: [netsuite-mapping, supabase-handover]
---

# NetSuite process profile

Built from read only extracts on 11/11/2026 covering the last 60 days, held locally in `discovery/data/` (git ignored). Customer details are redacted everywhere except the `notes_*` extracts and `employees_named`, which hold raw free text and staff names for local analysis only. Everything here can be re-checked against `netsuite.sqlite` without asking NetSuite again. Queries are logged in `queries.sql` (raw ones are marked RAW). **This document quotes no customer text.** Note examples are masked or described in general terms.

## What the extract holds

| Extract | Rows | Notes |
|---|---|---|
| `cases_60d` | 973 | Every case changed in the window, with status, type, vehicle and linked order |
| `tasks_60d` | 2,527 | Workshop tasks 1,437. Untyped tasks 1,090 |
| `transactions_60d` | 5,573 | 1,170 estimates, 1,019 sales orders, 807 invoices, 769 item fulfilments, 658 payments, 1,150 purchase orders |
| `links_60d` | 8,547 | Which document came from which |
| `lines_60d` | 47,413 | Lines on estimates, sales orders, invoices and fulfilments |
| `timebills_60d` | 634 | 902.5 hours |
| `assets_60d` | 1,029 | Vehicle records changed in the window (20,532 exist in total) |
| `employees` | 74 | Job title, department and activity only. No names or contact details |
| `employees_named` (raw) | 74 | Names, title, department, supervisor, active flag. Local only |
| `notes_cases_60d` (raw) | 974 | Case title, work details and job details |
| `notes_tasks_60d` (raw) | 2,413 | Task title and comments |
| `notes_task_outcomes_60d` (raw) | 306 | What the technician did and a reason code, written when a task is completed |
| `notes_transactions_60d` (raw) | 60 | Memos on orders, invoices and payments |
| `notes_assets_60d` (raw) | 63 | Notes on vehicle records |
| `schema_*` | 33 records | Field IDs, labels and types for the job related records |
| `catalog` | 297 record types | 77 custom |

## How a job flows today

1. **A case is the job.** One case per vehicle visit, linked to a customer and a vehicle record. 859 of 973 link to a sales order (772 sales orders, 3 estimates, and 84 outside the window). The link is the case field `custevent_nx_case_transaction`.
2. **Estimate, then sales order.** Staff quote the work. In the window, 299 estimates are open, 314 processed, 484 expired and 73 closed. An estimate turns into a sales order, which is the commercial record. It carries the vehicle details as body fields (rego, VIN, year, colour, fuel type, body type, transmission, odometer reading).
3. **Parts.** Parts are mostly **special ordered per job**: 974 sales orders spawned a purchase order. Parts leave on an item fulfilment (720 links), which the invoice follows.
4. **Booking.** The booking is an **FSM task** under the case (standard `task` table with FSM fields), assigned to a technician. Most cases have one task (655 of 908), then two (159), three (43) and so on up to 8. Extra tasks are extra visits and follow ups.
5. **Work.** A technician completes the task. Outcome is recorded as "All Works Completed" (319), "More To Do" (228) or "More To Do, Task Created" (2).
6. **Hours.** FSM creates a time bill per task. All 634 use an item called "Workshop Labour *DO NOT USE*", none are billable and none are marked billed or costed. They record hours only.
7. **Invoice and payment.** The sales order is billed (746 invoice links), then paid (672 payment links, 654 deposited).

Labour is sold on **order lines** as non inventory items (LAB4WD 2,701 lines, LAB 1,719, LABELEC 525), not through time bills. Of the 47,413 lines, 22,308 are inventory parts, 17,148 non inventory items (labour, freight, miscellaneous and consumables), 2,776 other charges and 1,759 discounts ("Discount 10%" on 1,428).

## Job stages

The case holds the real stages. There are only four:

| Case status | Cases | Typical order status |
|---|---|---|
| Not Started | 251 | Mostly Pending Fulfilment (142) |
| In Progress | 27 | Mostly Pending Fulfilment (14) |
| For Billing | 22 | Pending Fulfilment (9) or Pending Billing (2) |
| Closed | 673 | Mostly Billed (556) |

- Tasks have only three statuses (not started, in progress, complete). They mostly agree with the case (878 closed cases have a complete task), but not always: 57 In Progress cases already have a complete task and 16 Not Started cases do too.
- Our 12 job states have **no NetSuite equivalent beyond these four**. Checked in, waiting approval, waiting parts, quality check and ready for customer are not recorded anywhere we can see.
- Jobs are quick: median **0 days** from case start to close, 90% inside 7 days, longest 133.

## Case types and divisions

| Case type | Cases |
|---|---|
| Service | 404 |
| Repair | 224 |
| Accessory Fitment (small 259, medium 30, large 33, unsized 16) | 338 |
| Tyres | 7 |

- The **department** on the case separates the divisions cleanly: Mechanical (628) holds Service, Repair and Tyres, and McCormack's 4WD (344) holds Accessory Fitment. This maps onto our `division` field.
- Job subtype refines a service: Passenger Car Service (PETROL) 160, 4WD Vehicle Service (DIESEL) 139, Report Work 136, Diagnose 44, 4WD Vehicle Service (PETROL) 22 and Safety Certificate 6. It is blank on 368 cases.
- Priority is always Medium and origin, category and issue are never set.

## Who does what

Task owners are the people who create bookings. Assignees are the technicians.

| Role in NetSuite | Does | Closest role in our app |
|---|---|---|
| 4WD Sales (4 people) and Receptionist (5) | Create about 990 of the 1,437 bookings | Service advisor |
| Sales Manager (2) | Creates about 306 bookings | Service advisor or manager |
| Mechanical Manager (1) | Assigned 591 of 973 cases, books 89 tasks and holds 38 | Workshop controller |
| Fitter (6), Mechanic (3), Auto Electrician (1), Spray Painter (1), Fitter Foreman (1) | Do the work, about 1,130 tasks | Technician |

- 74 employees exist and 32 are active. None are flagged as job resources, so FSM technicians are not identified that way.
- **The Sales Manager on 187 tasks is explained.** It is the mechanical sales manager, and those are quote follow up tasks (see "How notes are used"). The two 4WD sales people hold about 420 tasks each, also follow ups. Neither is workshop work.
- **Bays are assigned work as if they were people.** Two non person records, a paint bay and an electrical bay, are task assignees (64 and 1 tasks). The roster also holds other non person records such as "Detail Bay 1", "Service Department" and supplier or group names. Our technician list needs to handle a bay or a team as an assignee.
- **Real technicians in the window:** 3 mechanics, 4 fitters, a fitter foreman, an auto electrician and a spray painter, plus 2 fitters who are now inactive. That is 11 to 12 people doing about 1,130 workshop tasks. The mechanical manager is also assigned work (38 workshop tasks).
- **The demo staff list does not match NetSuite.** Of the technicians in the seed data, only Ben Wenger and Dale Coleman are active NetSuite employees (and Brad Mulder, now inactive). The rest of the names supplied for the demo logins do not appear on the NetSuite roster. Check whether that list came from another source or is newer than NetSuite.

## Scheduling behaviour

- 18 technicians have Workshop tasks. The busiest has about 190 in the window.
- Bookings are made well ahead: median **18.5 days** before the start date, 138 of 1,437 on the day. Tasks are scheduled out to February 2027.
- Daily estimated hours are filled in on 96% of tasks (median 2.5 hours, range 0 to 10). Cases carry an estimated effort too (98 distinct values). 47 tasks span more than one day.
- The odometer reading is on 501 of 973 cases.
- The 1,090 untyped tasks all link to an **estimate** and 1,033 have not been started. **They are quote follow ups**: every one is titled "Followup Quote" (599) or "2 week Follow-up on Quote" (491) and is assigned to a salesperson. They are sales work, not workshop work, and should not appear on the planner.

## How notes are used

Free text is where the real job detail lives, because the case has no fields for the work requested, the customer's instructions or what was done. Read from the raw extracts on 11/11/2026. There are **no structured fields for any of this**, and the people entering it are not consistent.

| Where | Filled | What staff put there |
|---|---|---|
| Case title | 974 of 974 | A generated label: case type, a reference number, then the vehicle (make, year, model, series) and often the registration. It is the only thing staff see in a case list |
| Case "details" | 959 of 974 | **The work requested.** One line per item, median 2 lines, up to 33 |
| Case "job details" | 210 of 974 | Extra instructions: "as per estimate" with the estimate number, pick up or finish by times, and customer requests. Only 22% of cases |
| Task title | 2,413 | "Workshop" plus a reference and the vehicle, or "Followup Quote" |
| Task comments | 2,413 | For workshop tasks, a copy of the case details (identical on 820 of 1,312, a partial or close copy on 244 more, edited to something different on 248). Line breaks are lost, so items run together. For follow up tasks, the text "Followup Quote" and sometimes a call outcome |
| Task "actions taken" | 267 | **What the technician did**, written at completion. Almost all on Service (185) and Repair (67) |
| Task reason code | 217 | A list value, almost always 1. No text |
| Order and payment memos | 56 of 60 | A web shop order reference and amount (Shopify), or a date and a person |
| Vehicle notes | 63 | Oil specification for the vehicle (for example "OIL TYPE: C3") and an oil brand |

**What this tells us**

1. **The work request is a short list written in the case.** Standard services use a fixed phrase ("Passenger Car Service (PETROL)", "4wd Vehicle Service (DIESEL)", "Safety Certificate", "Air Conditioning Regas"). 384 of 626 service and repair cases (61%) start with one of the standard names. They are often combined with extras ("Passenger Car Service (PETROL) | Air Conditioning Regas"). Our **service templates and job lines should seed from this list**, and staff will expect to type a quick extra line beside them.
2. **Accessory fitment is a typed shopping list.** One line per accessory ("Fit Bullbar", "Fit Lightbar", "Fit Winch", "Fit Dual Battery", "Fit Fuel Tank"). **The job size is the length of the list**: small fitments (259 cases) have a median of 2 lines, medium (30) have 5 and large (33) have 9, up to 33. Mixed upper and lower case, with spelling variants. Our fitment jobs need a repeatable line list, not a single text box, and the size band could be suggested from the number of lines. About a quarter of all details (242 of 958) are typed in capitals.
3. **Repair requests are described, not coded.** The common words are report, diagnose, replace, brakes, rotors, pads, front, rear and "as per estimate". "Report work" and "Diagnose" are the job subtypes, so findings and a quote come back to the customer afterwards. This is the case for our inspection and additional work flow.
4. **Estimates are referenced by number inside the text.** 40 cases say "as per estimate" or give an estimate number. The link between the job and its quote is partly human, not just the link field. We should show the quote on the job, and let staff paste or pick it.
5. **Customer instructions are rare but important.** About 48 cases mention picking up, finishing by a time or waiting. These need a prominent "customer notes" area on the booking and the job tile, and a date or time field, not buried text.
6. **Technicians write a service record at the end.** On a service the "actions taken" note follows a pattern: the oil filter part number, then litres and grade of oil ("5w-30 C3"), then any extras (wiper blades, rotate and balance, fault codes), then the odometer reading in km. 188 of 267 include an odometer reading and 182 include an oil spec. **This is the best evidence of what our job completion screen should capture as fields**: odometer, oil and filter used, extras and a free note. NetSuite has no fields for these, so today the odometer on the order often comes from this text.
7. **The vehicle record carries a standing note.** The oil specification lives on the vehicle so a technician can see it next time. Our vehicle profile needs a "service notes" area that is shown on every job.
8. **Quote follow up is a call log in a comment box.** 1,090 follow up tasks are made on every quote ("Followup Quote" and "2 week Follow-up on Quote"). Only 63 have a note, and those are almost all the same: "NP called left vm & emailed" or "NP called". The notes show whether the customer was called, left a message or emailed, and little else. This is sales work done by 4WD sales and the mechanical sales manager. **It should not share the workshop planner**, but it shows an unmet need for a quote follow up list with a status and a last contacted date.
9. **Order memos are rare and mostly about the web shop.** Only 60 orders, invoices and payments in the window have a memo or note, and several are a Shopify order reference and a dollar amount. A web shop feeds NetSuite too, which we should ask about, but memos are not a job note. We do not need a memo field.
10. **Notes are one shot text.** Nothing records who wrote a line or when it was added, except in the system history which we cannot read. Our job notes should be dated and signed entries.

**What is not here**

- **Note history and case messages.** The notes tab and message history for a case or customer are not readable through SuiteQL for this role. The tables `note` and `message` are reported as not found, so the role is missing a permission for them. The role may need a notes or communication permission under Lists. The text we did read is the single field on each record, not the conversation around it.
- **Reason codes on tasks.** The reason not resolved is a list value (1 on 214 tasks), so we do not know the meaning without the list definition.

## FSM features they do not use

- "Booking confirmed" is set on 2 of 1,437 tasks, "Vehicle on site" on 0 and "Close case" on 1.
- A skill is set on only 224 tasks (Fitter 115, Painter 57, Mechanic 27, Auto Electrician 19, Working Bay 6).
- No case has an origin, category or issue, and the SMS job confirmation flag is false on every case where it is set.
- Only one task type exists, "Workshop".

## What this means for the integration

| Our feature | NetSuite home | Direction |
|---|---|---|
| Customers, vehicles | `customer`, `customrecord_nx_asset` (VIN, year, fuel, body, transmission, next service date, make and model records) | Read, then write new vehicles |
| Job card | Case (`supportcase`) with status, type, department, vehicle, estimated effort and linked sales order | Read now. Write later and only with approval |
| Booking and technician schedule | FSM task assigned to an employee, under the case | Read now. Writes should go through a RESTlet, since FSM reacts to task changes |
| Quote and approval | Estimate, then sales order | Read now. Write later and only with approval |
| Parts availability | Special order purchase orders, item fulfilments | Read |
| Hours | Time bills, hours only | Read. **Do not write directly**: FSM creates them as a side effect |
| Invoice summary | Invoice and payment | Read only |
| Our 12 job states | Four case statuses plus three task statuses | We keep the detail and send only the four case statuses (see below) |
| Work requested, job lines | Case "details" text, one line per item | Read into our service lines. Write back as lines in the same text field until a better home exists |
| Customer notes on a booking | Case "job details" text | Read and write. Keep it a separate field in our app so it can be shown prominently |
| Technician completion note (odometer, oil, filter, extras) | Task "actions taken" text | Write only, as one formatted text block (filter, oil, extras, odometer). We keep the separate fields |
| Vehicle service notes | Vehicle record notes text | Read and write |
| Quote follow ups | Tasks with no type, linked to the estimate | Read for a separate follow up list. Never mix with the planner |
| Staff and bays | Employees, including bay style records | Read. Tell people from bays by title |
| Division | Department on the case | Read and write |

A sensible mapping of our states onto the case: Booked, Confirmed and Checked in map to Not Started. In Progress, Waiting approval, Waiting parts and Blocked map to In Progress. Tech complete, Quality check and Ready for customer map to For Billing. Closed maps to Closed. This is a proposal and needs confirming with staff.

## Gaps still open

1. **System Notes for job records.** The role still sees only its own setup notes, so we cannot tell who changed what, or whether a person, the mobile app or a script did it. Audit Trail did not unlock it and the permission name is unconfirmed. The recording session will show this instead.
2. **The case support lists** (status, type, priority, origin and issue values). They are not readable by table name. Status and type names came through on the cases instead, so this is minor.
3. **Case messages and the notes tab.** The single note fields on each record are now extracted (see "How notes are used"), but the message history and notes tab are not readable. The role lacks a permission for them.
4. **What a case closing triggers.** For Billing to Closed and the matching sales order billing look automated. Their admin can confirm which workflow does it.

## Questions for the customer session

- Who owns quote follow up (the 4WD sales people and the mechanical sales manager), and what would a proper follow up list need to show?
- How do they know a vehicle has arrived, or is waiting for parts or approval, if those stages are not in NetSuite?
- Why are the paint bay and the electrical bay set up as people on tasks, and are bays meant to be booked like technicians?
- Where does the demo staff list come from, since most of those technicians are not on the NetSuite roster?
- On a completed service, what do they want captured as separate fields (odometer, oil, filter, extras)?
- Who reads the customer instructions and "as per estimate" lines, and how do they find the right estimate today?
- Is the web shop (Shopify) part of the workshop's process?
- Why is "Workshop Labour *DO NOT USE*" on every time bill?
- Who creates the case, the sales order and the task, and in what order? The case came first on 317 jobs, the order first on 184 and they were the same day on 271.
- What moves a case from For Billing to Closed, and who bills the sales order?
- Why are parts special ordered per job, and is there a stock list we should show?
- What do the "More To Do" outcomes trigger?
- Does McCormack's 4WD department (accessory fitment) follow the same process as Mechanical?
