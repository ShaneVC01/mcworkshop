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
| Arrival and assignment (workshop board, added 24/11/2026) | Case and task fields, not statuses | **Booked:** case created at opening time with the case owner set to the workshop manager (Harley Adams on job 17089) and the workshop task assigned to whoever booked it. **Vehicle arrived** (our Waiting assignment): Vehicle On Site, `custevent_nxc_case_vos` on the case and task. **Assigned:** the task's `assigned` employee and start and end, which staff set today by dragging on the Field Service Scheduler. **In progress:** task status PROGRESS when the mechanic starts. All to be confirmed with a test write |
| Vehicle | `customrecord_nx_asset` (20,532 records) | VIN, year, fuel, body, transmission, odometer unit, next service date. Make and model are `customrecord_ajg_make` and `customrecord_ajg_make_model`. The sales order also carries rego, VIN and odometer as body fields |
| Technician | `employee` | Title examples: Fitter, Mechanic, Auto Electrician, Spray Painter. No employee is flagged as a job resource |
| Quote | `estimate`, converting to `salesorder` | Link type `EstInvc` |
| Labour line and parts line | Lines on the estimate, sales order and invoice | Labour is sold as non inventory items (LAB4WD, LAB, LABELEC). Parts are inventory items, often special ordered through a purchase order per job. See Items and job lines below |
| Time entry | `timebill`, created by FSM | Hours only. Every one uses "Workshop Labour *DO NOT USE*" and none are billable. Never write these directly |
| Invoice | `invoice`, then `customerpayment` | Sales order to invoice is link type `OrdBill`. Read only |
| Division | Department on the case | Mechanical holds Service, Repair and Tyres. McCormack's 4WD holds Accessory Fitment |

### Items and job lines (added 24/11/2026)

Read only discovery for one off parts, labour and charges on a booking. Counts and item codes only.

| Finding | Detail |
|---|---|
| Where lines live | Every billable line is an item line on the estimate, the sales order and the invoice: item, quantity, rate and amount. There is no separate labour record. Time entries are hours only and never billable |
| Labour | Non inventory items in the Labour class. Hours go in the quantity. Hourly items: LAB (general, about $150 an hour), LAB4WD and LABELEC (about $164). Fixed time items carry their own standard time: LABAIRFILTER (0.1 to 0.15 h), LABCABIN, LABFBRAKE (about 1 h), LABRBRAKE (about 1.1 h) and LABDRUMBRAKE |
| Parts | Inventory items, about 32,178 of them. Many have no display name, so staff find them by part number and class (Brakes and rotors, Oil filters and so on) |
| Charges | Non inventory items such as WC (workshop consumables), TWR (toxic waste removal), FREIGHT and MISC, plus discount items. About 728 non inventory items in all |
| Service kits | 85 item groups. The "4WD Vehicle Service (DIESEL)" group holds KE75-N1C8, placeholder motor oil and oil filter lines, SP, WBA, TWR, WC and LAB at 1.5 h. Staff swap the placeholders for the real parts on the sales order |
| Part to labour link | None in NetSuite. Of 866 sales orders with parts, 671 also carry hourly labour, so fitting labour is added by hand today |

How the app uses it:

| Our entity | NetSuite home | Direction |
|---|---|---|
| Item (`CatalogueItem`) | `item`: inventory parts, non inventory labour and charges. Our `kind` comes from the item type and class, `unitCents` from the base price, `standardHours` from the fixed time labour items | **Read**, synced into an `items` table. Mock list in `src/data/mock/items.ts` is illustrative only |
| Usual fitting labour (`CatalogueItem.fitting`) | None. NetSuite has no part to labour link | **App only**. A suggestion staff can change or remove on the booking. To be filled in with the workshop |
| Booking item line (`BookingItem`) | One estimate or sales order line per item: item, quantity (hours for labour), rate. Fitting labour is its own labour line after the part | **Write** when the booking is sent, dry run first. Our `LabourLine.itemId` and `PartsLine.itemId` hold the item so the line goes back as the same item |

Labour picked from the items list keeps the item's own rate. The service templates still use the app's labour rate setting, so the two can differ until the rate is read from NetSuite.

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
| Customer | `customer` | **Confirmed by SuiteQL on 11/11/2026:** `id`, `entityid`, `isperson`, `companyname`, `firstname`, `lastname`, `email`, `phone`, `mobilephone`, `datecreated`, `isinactive`. Still to check: default address (street and postcode, now editable on the booking screen) | Read (live through `customers-list`). Write for new customers created at booking and for mobile, email and address edits made at booking | **Findings:** all 100 most recent active customers are records with `isperson` false, so individuals are stored as companies and the person's name sits in `companyname`. `mobilephone` was empty on all 100 and `phone` holds the number. About 20 in 25 have an email. `datecreated` comes back as DD/MM/YYYY text |
| Vehicle | FSM Asset (`customrecord_nx_asset`) or a McCormacks custom vehicle record | Rego, state, VIN, make, model, year, odometer, customer link | Read. Write for new vehicles and odometer updates | Which record holds vehicles, field IDs for rego and VIN, where make and model live |
| Technician | `employee` flagged as an FSM resource | `id`, name, active flag, work calendar | Read | How skills are recorded, if at all. Shift hours and leave source |
| Technician unavailability | Time off or calendar events against the employee | Date range, type | Read | Where leave and training are recorded |
| Bay | Custom list or custom record | Name, type | Read | Whether bays exist in NetSuite. May stay app only |
| Service template | Service items, item groups or FSM task templates | Name, labour hours, default parts, price | Read | How canned jobs are modelled today. Checklist content may stay app only |
| Booking | CRM task or project task under an FSM case (`supportcase`) | Start, end, assigned employee, case link, status, booking type (service, service and repairs, repair only) | Read and write | Exact case to task relationship, which record carries the scheduled time. Which field or case type marks a repair only job, and how that stops service reminders |
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

## Booking on capacity, parts lead time and follow up (added 24/11/2026)

| Our entity | NetSuite home | Direction |
|---|---|---|
| Booking without a mechanic | Case and workshop task at the drop off time, task owned by the workshop manager as today. The mechanic is set on the task when the vehicle arrives and the controller assigns it | **Write**, dry run first |
| Item stock and lead time (`CatalogueItem.stocked`, `leadTimeDays`) | Likely the item's purchasing lead time and its special order or drop ship flags. To confirm with a read only query before mapping | **Read**. Mock values are illustrative |
| Part order (`PartOrder`) | Likely a special order purchase order raised from the sales order line, then an item receipt when it arrives. To confirm | **App only for now** |
| Booking reminder and confirmation (`reminderSentAt`, `customerConfirmedAt`) | Wherever the reminder message and the customer's reply are stored today (case messages or communication records). To confirm | **Read** later |
| Workshop breaks and gap between vehicles | None | **App only** |

### Close out: checked, invoiced, paid (added 24/11/2026)

A finished job no longer stops at complete. The steps and who takes them:

| Our status | Who | NetSuite | Direction |
|---|---|---|---|
| Work complete | Mechanic | Task status complete | Write, dry run first |
| Ready to invoice | Workshop controller or manager, after the close out checks pass | Sales order released for billing. Field or status to confirm | Write later, dry run first |
| Invoiced, ready to collect | The service advisor, with Fulfil then Save & Bill on the sales order (seen in the invoice walkthrough of 20/11/2026; reception does not raise it) | Item fulfilment, then invoice from the sales order (`OrdBill`) | **Read**. The app never creates invoices |
| Paid (final) | Reception, when the customer pays at collection | Customer payment applied, invoice paid in full | **Read** later. Recording a payment from the app would be a write and needs approval |

### Future integration: specialist part orders (flagged 24/11/2026)

Specialist parts are the ones not kept in stock and ordered in for one booking: control arms, bushings, wheel bearings, brake parts for less common vehicles and dealer only parts. Service parts kept on the shelf (oil, filters and the like, usually delivered same day by the regular suppliers) stay with the current NetSuite stock process and never get a part order.

To build later:

1. Read the purchase orders that NetSuite raises for a job's specialist lines and link each to our `part_orders` row (by sales order line), so ordered, supplier and ETA come from NetSuite when staff order there.
2. When a part arrives, check it in from the Parts page and write the item receipt to NetSuite against that purchase order, so stock and the job stay in step. Dry run first and only with Shane's approval for each write.
3. A wrong part received keeps the order open, records the note and flags the booking at risk.
4. Keep the parts page as the controller's view of what to order and by when; NetSuite stays the system of record for stock.

### Future integration: customer replies to reminders (flagged 24/11/2026)

Customers get a booking notice and a reminder, and many reply in their own words. When NetSuite holds the reply, read it and show it on the booking and the Unconfirmed list.

Each reply is sorted into one of these, with the words kept for staff to read:

| Meaning | Examples | What the app does |
|---|---|---|
| Coming (said plainly) | "Yes", "Confirmed", "See you then" | Mark confirmed |
| Coming (implied) | "Just dropping the kids at school, see you soon", "On my way" | Mark confirmed, show the reply so staff can check |
| Wants to move it | "Can we do Thursday instead?", "Running late, can I come at 10?" | Leave unconfirmed, flag **change requested** for a call back |
| Not coming | "Cancel please", "Car's been sold" | Flag **cancel requested**. Staff cancel; never automatic |
| Unclear or a question | "How long will it take?", "Is the loan car free?" | Leave unconfirmed, flag **reply needs reading** |

Rules: the interpretation is a suggestion with the original text beside it; anything other than a plain yes keeps a person in the loop; no reply by the day before counts as unconfirmed and goes on the call list. Replies contain customer data, so they are never logged or printed.

## Walkthrough: booking a large accessory fitment (video of 20/11/2026)

A 6 minute screen recording by a 4WD salesperson, with no narration, so everything below is read from the screen. It shows how a sold accessory fitment is turned into a workshop booking. No customer details are recorded here. Field IDs come from the local discovery schema (`discovery/data/netsuite.sqlite`); anything not found there is marked to confirm.

### What the salesperson does, step by step

| # | Step in NetSuite | Record and fields touched | What it tells us |
|---|---|---|---|
| 1 | Opens the sales order that was created from the accepted estimate | `salesorder`: department and location McCormack's 4WD, status Pending Fulfilment, a customer deposit already taken, lines for the accessory kits, a Consumables T&C line, paint and freight | The 4WD booking starts from a **sold sales order**, not a blank booking. The order has toolbar actions for Create Deposit, Create PO, SMS, Add Items From Repco and Add Items From Bursons |
| 2 | Checks capacity on the Field Service Scheduler, paging forward week by week to February 2027 (about 3 months out) | Read only. Lanes are grouped by skill: working bay or detailer, auto electrician, fitter, mechanic, painter. Bays (electrical, paint, detail) are lanes. Annual leave shows as blocks on a person's lane | Large fitments are booked months ahead. Leave is visible on the board, so it is stored somewhere FSM reads (likely `customrecord_nx_employee_non_working_day`, to confirm) |
| 3 | Opens the dashboard workbook "Daily Task Workbook, Ironborn 4WD Task Summary" | A pivot over tasks: estimated hours summed per day, by task skill (Fitter, Auto Electrician) and assignee, with daily and grand totals | **The real capacity check is hours per skill per day.** A full day shows as 7.6 hours per person. The board alone is not enough for them |
| 4 | Creates the job from the order: Actions, Create New, Job | New `supportcase`, prefilled with the order (`custevent_nx_case_transaction`), customer, contact details and vehicle (`custevent_nx_case_asset`) | The case is created **from** the sales order, so the link is set by NetSuite, not typed |
| 5 | Fills the case header | Department McCormack's 4WD (required, defaults blank). Job type changed from Service to LARGE, Accessory Fitment. Project left as "New: Billable" (required). SMS Job Confirmation (`custevent_sms_job_confirm`) ticked. Assigned set to the salesperson. Status Not Started, priority Medium | On 4WD jobs the **salesperson** is the case assignee, unlike Mechanical where the workshop manager is. The Project field suggests a project record is created per case (to confirm) |
| 6 | Types the work list into Job Details, one line per accessory | `custevent_nxc_cef_jobdetails`: about 25 "Fit ..." lines (bullbar, lightbar, winch, UHF, GVM kit, airbags, fuel tank, bash plates, rear bar, flares, brake controller, isolator and Anderson plug, drawers, fridge, dual battery, inverter, tailgate light, safety system and so on) | **Retyped by hand** although the same items are already lines on the sales order. Mixed case and spelling as found in discovery |
| 7 | Sets the job window | Job start 15/02/2027 7:00 am and job end 02/03/2027 4:00 pm (`custevent_nx_start_date`, `custevent_nx_end_date` plus times), time zone Brisbane | The case carries the whole visit window (here about two weeks), separate from the daily tasks |
| 8 | Enters Estimated Effort (man hours) of 66, using the Windows calculator | `custevent_nxc_est_hours` (required) | Total hours are worked out by hand and not checked against the tasks |
| 9 | Adds tasks in the case's "Add Tasks" panel, one trade at a time | Per row: type Workshop, skill (picking Fitter filters Assigned to "5 available"), assignee, start and end date, start and end time, daily estimated hours (`custevent_nxc_task_dailyestimatedhours`), Confirmed Booking (`custevent_nx_task_booking_confirmed`, left unticked) and a message (`message`) | **One date range becomes one task per working day.** A fitter got 6 daily tasks at 7:00 to 4:00 and 7 hours (weekend skipped). An auto electrician got 4 daily tasks with 4, 7, 7 and 6 hours, starting on the fitter's last day |
| 10 | Splits the work list between the trades | The task message is edited per trade: fitting lines to the fitter, electrical lines to the auto electrician | The trade split lives only in free text. Line breaks are lost in the task list ("Fit BullbarFit Lightbar...") |
| 11 | Reconciles hours with the calculator, then goes back to the sales order lines | Read only | Checks the booked hours against the hours sold on the order. Saving is not shown in this recording, but it is in the narrated re-recording below |

### Narrated re-recording (video of 20/11/2026, 10:51 AM)

The booking was recorded again with sound ("redone the video as the audio did not work on the first video") and this time saved. It confirms the steps above and answers most of the questions below. Where this list and the tables differ, this list wins.

1. **Hours and days are worked out on paper first:** about 66 hours, "approximately 10 days worth of work for the workshop".
2. **Finding the start date:** the booker pages the scheduler week by week from the earliest date the customer can do (here 1 February 2027) until the right fitters are free. Only some fitters do this kind of job ("only ever go under someone like Jordan, Josh, or potentially Elvis"), so suitability by job type matters as well as skill.
3. **The workbook is a cross check,** "just to cross check that someone hasn't made a booking and it just hasn't ported over properly or they haven't set it up properly". Zero hours on a day means the fitter is free. After saving, the booker checks the new hours appear there too.
4. **SMS Job Confirmation sends a text on save** telling the customer the job is booked to start on the start date. Answers G9: the case flag triggers the booking text, through the SMS app seen in the invoice walkthrough.
5. **Assigned on the case is "the person in charge of the job"** (the salesperson). Answers G10.
6. **Job end is the customer's collection date, not the end of the work.** Work was planned to finish on 26 February, but the job end and collection were set to 2 March. That leaves time for a full check over, a detail and clean, and a buffer for delays. The app needs a collection date separate from the last work day.
7. **The workshop starts at 7:00 and a booked day is 7 hours** (7:00 to 4:00 pm). A fitter with 5.5 days of work gets 5 days at 7 hours and the remainder (4 hours) on the next working day. The auto electrician gets about 3 days the same way.
8. **Saving the case creates the tasks and the project.** The Project field changed from "New: Billable" to "Billable : 15/02/2027 AEST" after the tasks were added, so a billable project is created per job and named by its start date. Answers part of G11. The scheduler then shows one bar per person per day.
9. **The point of the scheduler and workbook is utilisation:** "everyone in the company can see what work is booked in and who's got what", and spare hours per person per day show where more work fits.

### Gaps: what the app must do in NetSuite for this flow

| Gap | Today in NetSuite | What the app needs | NetSuite action and direction | Status |
|---|---|---|---|---|
| G1. Book from a sold order | Case created from the sales order's Actions menu | "Book this order": pick an open 4WD sales order and start the booking from it | **Read** sales orders (Pending Fulfilment, department McCormack's 4WD, no linked case). **Write** a `supportcase` with `custevent_nx_case_transaction` set. Dry run first | Field confirmed. Whether creating the case through REST also sets the order's back link, to confirm with one approved test write |
| G2. Work list from order lines | Job Details retyped by hand | Seed the job's line list from the order's item lines, editable | **Read** order lines. **Write** the list as text to `custevent_nxc_cef_jobdetails`, one line per item | Confirmed field. Our `BookingItem` lines already model this |
| G3. Multi day, multi trade booking | One task per person per day, built by the Add Tasks panel | A booking made of several trade blocks (skill, person, date range, daily hours, their part of the work list) | **Write** one `task` per working day per person under the case, with skill, assignee, dates, times, daily hours and message. Must go through a RESTlet or the same script the panel uses, since FSM reacts to task changes (pathway C) | **Open.** Our `Booking` holds one mechanic and one time slot. Needs a design change before the custom build division |
| G4. Capacity by skill | Separate dashboard workbook summing daily estimated hours by skill and person | Planner capacity shown per skill per day (fitter, auto electrician, mechanic), against 7.6 hours per person | **Read** tasks with `custevent_nxc_task_dailyestimatedhours`, skill and assignee. Read the work calendar for the 7.6 hour day | To confirm the 7.6 hour day in `customrecord_nx_work_calendar` |
| G5. Skills | Skill on the task filters the assignee list | Technician skills, and filtering the assignee by skill | **Read** `customrecord_nx_skill` and how employees are linked to skills | Which field links an employee to a skill, to confirm |
| G6. Leave | Shown as blocks on the scheduler | Mechanic unavailability on the planner | **Read** leave records | Likely `customrecord_nx_employee_non_working_day`, to confirm with a read query |
| G7. Estimated effort | Typed after a calculator sum | Computed from the trade blocks (sum of daily hours) and shown against hours sold | **Write** `custevent_nxc_est_hours` as the computed total | Confirmed field |
| G8. Job window | Case start and end set by hand | Derived from the first and last task | **Write** case start and end date and time | Confirmed fields. The time fields beside the dates are to confirm |
| G9. SMS confirmation | Ticked on the case at booking | Booking notice sent when the booking is made | **Write** `custevent_sms_job_confirm`. Find out what sends the SMS (likely a script or workflow on save) before the app sets it | Contradicts discovery, where it was false on every case. Ask whether it is new or only used by 4WD |
| G10. Case assignee | Salesperson on 4WD jobs | Advisor who owns the job, by division | **Write** `assigned` on the case: the salesperson for 4WD, the workshop manager for Mechanical | Rule to confirm with the workshop |
| G11. Project per case | "New: Billable" on a required Project field | Nothing visible to staff | Find out what record it creates (`job` or project) and whether REST must send it | **To confirm** before any case write |
| G12. Deposits | Create Deposit on the sales order | Show the deposit taken on the booking and job | **Read** `customerdeposit` linked to the order | Read only. Taking a deposit from the app would be a write and needs approval |
| G13. Supplier ordering | Add Items From Repco or Bursons and Create PO on the order | Parts page shows these lines and their purchase orders | **Read** the purchase orders and their receipts (see specialist part orders above) | Supplier catalogue tools stay in NetSuite |
| G14. Bays as lanes | Electrical, paint and detail bays are scheduler lanes | Bay lanes on the planner, bookable as a resource | **Read** the bay style employee records | As already noted in Admin catalogue and settings |

### Questions for the customer

1. Is the case saved first and the tasks added later, or both at once? Who books the tasks for 4WD jobs, the salesperson or the workshop controller?
2. Is the "Daily Task Workbook" the main tool for deciding the booking date, and is 7.6 hours the standard day for every trade?
3. How do they decide the split between fitter and auto electrician, and should the app suggest it from the item lines?
4. What does the Project "New: Billable" create, and is it used for anything later?
5. What sends the SMS when SMS Job Confirmation is ticked, and does the Mechanical side use it too?
6. Should the work list on the job match the sales order lines exactly, or is the list a simplified version for the workshop?

## Walkthrough: service, extra work, Repco parts order and follow up (video of 20/11/2026, "Number 2, Reports")

A 16 minute recording, narrated by the mechanical service advisor, on test job 17089 (a test customer, a 4WD diesel service). It covers what the advisor does after the mechanic finishes the service and the checklist: build the sales order, phone the customer for approval of extra work, order the missing parts from Repco and put the extra work on a mechanic's schedule. Field IDs come from the local discovery schema. Anything not found there is marked to confirm.

### What happens, step by step

| # | Time | Step in NetSuite (or Repco) | Record and fields touched | What it tells us |
|---|---|---|---|---|
| 1 | 0:00 | Scheduler shows the mechanic's 7:00 to 9:00 service task as completed | `task` under the case | Start point: the service itself is done |
| 2 | 1:14 | Opens the **Job Service Report** PDF from the case | FSM service report template, built from the case, the task (`custevent_nx_actions_taken`) and a completed checklist | **NetSuite already holds a structured inspection checklist** ("Checklists completed"): about 50 items with Pass, Fail or N/A, brake rotor and pad measurements, tyre size, pressures before and after, tread depth per wheel, battery actual and specified CCA, and notes for lights and tyres. Here the park light, air filter and cabin filter failed |
| 3 | 0:54 | Updates the vehicle (Field Service Asset) with the odometer from the mechanic's notes, then cylinders, fuel, body, transmission and colour | `customrecord_nx_asset`: odometer (`custrecord_nxc_na_odometerunit`) and details | Typed by hand from the report. The advisor asked for vehicle details to fill in automatically from the rego ("which Shane is going to try and sort") |
| 4 | 2:14 | "I don't have a sales order created": Create Sales Order on the case | `salesorder` created from the case, department Mechanical, location RPM Mechanical, prefilled with the service item group (kit, placeholder oil and filter, sump plug washer, washer additive, toxic waste, workshop consumables, LAB 1.5 h). Freight removed | **The sales order is created after the service, not at booking.** It takes a while to load and prefill |
| 5 | 2:42 | Swaps the placeholder oil and oil filter for the real items, from the mechanic's Actions Taken and a printed "oil sheet" of product codes, and sets 7.5 L. Adds a custom BULB line (non inventory) for the park light already replaced | Order lines: item, quantity, description, rate | The advisor maps the mechanic's free text to item codes by hand. The advisor said the ideal is the mechanic's entry on the iPad "cross referencing straight into that system" |
| 6 | 4:07 | Opens **Repco NavigatorPro** from NetSuite, vehicle found by rego and state, to check stock and price of the air and cabin filters | Outside NetSuite. Chooses between brands on stock and price (Repco filters are OEM approved for new vehicle warranty, Proselect is cheaper and fine for a 2014 vehicle). Adds the parts to the Repco Order Pad | Brand choice and stock come from Repco, not NetSuite |
| 7 | 6:05 | "Convert over": Add Items From Repco puts the parts on the sales order, then the matching labour items are added by hand | Lines PSA561 (air filter), LABAIRFILTER 0.15 h, PCF631A (cabin filter), LABCABIN 0.25 h. Both parts show Back Ordered 1 | Confirms the part plus fixed time labour pairing, added by hand (see Items and job lines) |
| 8 | 7:09 | Checks Repco **SmartQuote** (the log book) for what is due at this and the next service | Outside NetSuite. Service schedules by model and km interval (here 130,000 km or 78 months), extra labour times (fuel filter 0.5 h) and a service operations checklist | Repco is where the advisor checks the log book. NetSuite has no service schedule. Relevant to our service profiles |
| 9 | 8:28 | Adds a **Note** line: "Next service we will re-inspect the following", with the tyre wear | A `Note` item line with text only, no price | Kept short on purpose: it prints "at the bottom of the invoice" and the detail is given on the phone |
| 10 | 10:26 | **Phones the customer**: explains what was done and found, recommends the two filters, quotes the new total and gets a verbal yes. Tells them the parts come on the 10 o'clock run | Nothing recorded in NetSuite | **Approval of extra work is verbal and leaves no record.** No estimate is raised for it |
| 11 | 12:25 | **Create PO** on the sales order opens "Create New Purchase Order for SO...": vendor Repco, tick the lines to buy | Custom Suitelet. Only the two filters are ticked; the oil and oil filter are in stock | Creates a `purchaseorder` linked to the sales order (department Mechanical and the advisor) |
| 12 | 12:56 | The purchase order | `purchaseorder`: vendor Repco, vendor part numbers, rate, GST 10%. Buttons Receive, Bill, **Send PO to Repco** | The PO is created in NetSuite first |
| 13 | 13:00 | Send PO to Repco: logs in to Repco, Order Checkout with the PO number as the order reference, delivery by Repco's freight, Send order. Returns through Repco's "SendToHookURL" | Outside NetSuite, then a call back into NetSuite | The supplier order carries our PO number, so the receipt can be matched. What the call back writes is to confirm |
| 14 | 13:44 | Creates another task on the job "to keep record of the upsells done in a day", by copying the mechanic's task | New `task` under the same case: details "Replace air and cabin filters", estimated hours 0.4 (0.15 plus 0.25), 10:00 to 12:00, assigned to the advisor at first, Not Started. The copied form also shows the original task's Task Result More To Do (`custevent_nxc_task_result`), Reason Not Resolved "Additional Parts/Labour Required" (`custevent_nxc_reason_not_resolved`) and Actions Taken (`custevent_nx_actions_taken`: oil, filter, bulb, odometer) | **The follow up is a task under the same case.** 10:00 to noon is the advisor's own convention to mark "extra items today" apart from the day's bookings. Explains the "More To Do" outcomes found in discovery |
| 15 | 15:13 | Tells the mechanic in person that the task is on his schedule and the parts are on the shelf. The mechanic clocks on, fits them and completes the task, usually without typing anything | Task status, time tracking | Actions Taken from every task under the case roll up to the job's actions. The handover to the mechanic is verbal |

### Gaps: what the app must do in NetSuite for this flow

| Gap | Today in NetSuite | What the app needs | NetSuite action and direction | Status |
|---|---|---|---|---|
| R1. Inspection checklist | FSM checklist on the task, printed on the Job Service Report | Our inspection screen captures the same items and readings | **Write** the checklist results to the FSM checklist records, or keep them in the app and send only a summary. Find the checklist record type (likely a `customrecord_nx_*` record) first | **To confirm.** This changes the earlier assumption that checklists stay app only |
| R2. Service report | Generated PDF from the case | The app can show or print the same report | **Read** the PDF through the existing Suitelet, or build our own report | Decide which |
| R3. Sales order built after the service | Created from the case after the work, then placeholders swapped by hand | Create the order when the job is booked, from the service lines, and let the mechanic's completion entries (oil, filter, litres) pick the real items | **Write** a `salesorder` from the case, then update its lines. Dry run first | Timing is a design choice. Ask whether the order can exist from booking |
| R3a. Extra work and approval | Lines added to the same sales order after a phone call. No estimate, no record of the yes | Approved findings become order lines (part plus its fitting labour), with who approved, when and how (phone) recorded in the app | **Write** new lines to the existing `salesorder`. Approval stays in our activity events, since NetSuite has nowhere to hold it | Our findings and quote flow assumes an estimate. Change it to "add to the job" with a recorded approval |
| R4. Next service advice | A `Note` item line on the sales order | A "next service" note on the job that goes to the invoice | **Write** a Note item line with the text | Note item ID to confirm |
| R5. Parts ordering from Repco | Create PO Suitelet, then Send PO to Repco | Parts page shows which lines need ordering, the PO and its state | **Read** `purchaseorder` linked to the sales order (vendor, lines, received). The app does not place the Repco order; staff keep using the two buttons | Matches the specialist part orders plan above |
| R6. In stock or back ordered | Back Ordered column on the order line | Show stock state per part line | **Read** the line's back ordered, committed and available quantities | Confirmed on screen |
| R7. Vehicle details after service | Typed onto the asset by hand | Odometer and vehicle details captured at completion update the vehicle | **Write** `customrecord_nx_asset` odometer and details. Dry run first | Confirmed field |
| R8. Task completion | Task Result, Reason Not Resolved, Actions Taken | Our completion screen sets these from the mechanic's answers | **Write** through a RESTlet (pathway C), since FSM reacts to completion | Value lists for result and reason to read |
| R9. Extra work task | Copy of the task under the same case, 10:00 to noon by convention, then a verbal handover to the mechanic | "Add extra work" on the job puts a task on the mechanic's planner lane, with hours from the labour lines and a "waiting parts" state until the parts arrive | **Write** a new `task` under the case with details, hours, time and mechanic | Case stays In Progress. Confirm the case status rule |
| R9a. Part arrival | The advisor watches for the delivery run and tells the mechanic | Parts page and job show when the PO lines are received, then the task is ready to start | **Read** item receipts against the PO | See specialist part orders above |
| R10. Billing type on task | "Rule 3, consumables and expenses billable" | Nothing visible to staff | Send the same default when the app creates tasks | Default value to confirm |
| R11. Repco service data | SmartQuote schedules and labour times | Possible source for service profiles | Outside NetSuite. Ask whether Repco data can be licensed or exported | Idea only |

### Questions for the customer

1. When do you raise an estimate for extra work, and when is a phone call enough?
2. Can the sales order be created at booking instead of after the service?
3. Is Repco the only supplier for this flow, or do Bursons orders work the same way?
4. Should the app show the Repco log book (SmartQuote) items due, or is opening Repco enough?
5. Is the inspection checklist used on every service, and on which device do mechanics fill it in?
6. What does Repco's call back (SendToHookURL) change in NetSuite after an order is sent?

## Walkthrough: fulfil, invoice and car ready message (video of 20/11/2026, "Number 2, Invoice")

A 3 minute recording, narrated by the mechanical service advisor, on the same test job 17089. It follows on from the Repco walkthrough: the filters have been fitted, and the advisor closes the job out. Field IDs to confirm unless stated.

### What happens, step by step

| # | Time | Step in NetSuite | Record and fields touched | What it tells us |
|---|---|---|---|---|
| 1 | 0:00 | Opens the case to reach the sales order | `supportcase`: NextService section shows Unbilled Total and Unbilled Sales for the job. Subtabs Transactions, Tasks, Service Record and Timebills | The case is the advisor's way in to the job's money |
| 2 | 0:13 | Checks the sales order lines and the next service note, then clicks **Fulfill** | `salesorder` | The advisor, not reception, starts the close out |
| 3 | 0:24 | An error appears on fulfil, which he puts down to "an error on our side" and carries on. On the item fulfilment he ticks every line (Mark All), including the two filters | `itemfulfillment` (`itemship`): one Fulfill tick per line, department, class and location per line, status Picked, then changed to **Shipped** | **Parts are fulfilled before they are received into stock**: the filters' purchase order had not been received ("hasn't been received into stock yet") but the parts were fitted. Stock goes out of step until the receipt is entered |
| 4 | 0:58 | **Save & Bill** creates the invoice | `invoice` from the sales order: custom form "McCormacks, Invoice", account Trade Debtors, department Mechanical, location RPM Mechanical, **Customer Follow Up** (required, set to No Follow Up Required). Lines copied from the order, including the service group, labour and the Note line | Fulfil and bill is one action for them. The invoice is made by the advisor |
| 5 | 1:09 | Reads through the invoice lines and saves | Invoice status Open, amount due equal to the total. Buttons Accept Payment, Credit, Authorize Return, SMS | Payment is taken later at the front counter ("the girls process that") |
| 6 | 1:30 | **Phones the customer** to say the car is done. Only if there is no answer does he send a text | Nothing recorded | Phone first, text as the fallback |
| 7 | 1:40 | Tries the **SMS** button on the invoice. The composer opens with raw labels ("singleSms.pageHeader", "common.fields.templates.label") and he backs out: "I don't usually go SMS through this side" | Suitelet script 1282 | **The invoice SMS button is broken** (untranslated). Report to their admin |
| 8 | 2:03 | Opens the customer record, **Conversations** | SMS app Suitelet (script 984) on the customer: the message thread, Send to (mobile), Sender ID, Files, Scheduled Messages, an AI Assistant, and a template picker | The thread shows the earlier **booking confirmation texts** (10/11 and 20/11, both Delivered), so booking texts already go through this app |
| 9 | 2:17 | Picks **Mechanical: Car Ready Template** and sends | Template text: car ready for collection, call if you cannot collect before 5 pm. "The message has been sent" | Templates seen: Customer first Template, Mech Report Items, Mechanical: Car Ready Template, Mechanical: Thank you + Review, Portal Welcome |
| 10 | 2:43 | Back on the scheduler the service task shows Completed | | The job is done from the workshop's side. Payment is next |

### Gaps: what the app must do in NetSuite for this flow

| Gap | Today in NetSuite | What the app needs | NetSuite action and direction | Status |
|---|---|---|---|---|
| I1. Who invoices | The advisor fulfils and bills. Reception takes payment | Our close out has the controller mark Ready to invoice and reception raise the invoice. Change it: the advisor does Ready to invoice, then **Fulfil and bill in NetSuite**. Reception records payment | **None from the app.** The app never creates invoices (rule 9). It reads the fulfilment and invoice and moves the job to Invoiced | Update the close out table above and the job state labels |
| I2. Parts fitted before receipt | Fulfilment ships lines whose purchase order is not received | Before the job can go to Ready to invoice, warn when a part line's order is not received, so staff receive it first | **Read** purchase order receipts (see R5 and R9a) and the order line's committed quantity | Ask whether receiving first is the rule they want |
| I3. Fulfil error | An error on fulfil, ignored | Nothing in the app | Ask their admin what the error is (possibly the oil quantity in litres against the item's unit) | **To confirm** |
| I4. Customer Follow Up | Required field on every invoice | Nothing visible. Optional "follow up needed" on the job that the advisor sets before billing | **Read** the invoice field. List values to confirm | Low priority |
| I5. Invoice and payment status | Invoice Open, then paid at the counter | Job moves to Invoiced, ready to collect, then Paid | **Read** `invoice` (status, amount due) and `customerpayment` | As in the close out table |
| I6. Car ready message | Phone call, then the Car Ready template in Conversations if no answer | A "Car ready" step on the job: record the call, and offer to send the car ready text | **Write** to the SMS app, not to a NetSuite record. Find out which SMS provider sits behind Conversations and whether it has an API, or keep sending in NetSuite and only read the thread | **To confirm.** Sending a customer message from the app needs approval like any write |
| I7. Message history and replies | The Conversations thread on the customer | Show the thread (booking texts, reminders, car ready, replies) on the booking and job | **Read** the SMS app's message records | **Answers the open question** in "customer replies to reminders": replies live in this thread. Record type to find, since the discovery role could not read messages |
| I8. Booking confirmation text | Sent through the same app, delivered on booking | The app's booking confirmation should trigger the same template | Likely sent by a script when SMS Job Confirmation is ticked (see G9). Confirm before the app sets it | Links G9 |
| I9. Message templates | Templates in the SMS app | Template names to reuse for car ready, thank you and review, and report items | **Read** the template list | Template record to find |

### Questions for the customer

1. Should parts always be received before the job is fulfilled and billed?
2. What is the error shown on Fulfill?
3. Which SMS service is behind Conversations, and can other systems send through it?
4. Is "Mech Report Items" used to text the inspection findings, and when?
5. Is the Thank you + Review text sent after payment, and by whom?

## Walkthrough: the mechanic's tablet during a service (video "FSM, car service")

A 7 minute screen recording of the NetSuite FSM mobile app ("Field Service", the NextService app) on the workshop iPad, with no sound. It shows the mechanic doing test job 17089 from 8:23 to 8:29 am: start, the service checklist, the completion note and complete. This is the screen our mechanic view replaces. Field IDs are to confirm unless stated.

### What the mechanic does, step by step

| # | Time | Screen | What is entered | What it tells us |
|---|---|---|---|---|
| 1 | 0:00 | **Task list** beside a street map | Tasks grouped by day. Each shows priority, time slot, "SERVICE" and the customer, task number, vehicle and rego, "BAY:" with the mechanic's name, and Not Started or Completed | The list is a field service list built for travelling technicians. The map has no use in a workshop |
| 2 | 0:20 | **Task detail**, then Start | Case number, case type, case details, task number, type and details. Start stamps 8:23 AM and the task goes In Progress | One tap to start |
| 3 | 0:25 | **Time** opens on start | A time entry: Item "Workshop Labour \*DO NOT USE\*" (preset, cannot be changed), Hours 0.25 (preset), Description, Start Current Activity ticked with the start stamp, End Current Activity unticked | **Explains the discovery finding** that every time bill uses that item, with hours that do not match the real time |
| 4 | 0:40 | Task menu | Time, Vehicle Details, Contacts, Service History, Sales Order, Service Record, Task Status, Files, and Job Completion & Signatures (locked until complete) | The mechanic can see the sales order and service history on the tablet |
| 5 | 0:45 | **Service Record** (the checklist) | Every item is required. Pass, Fail or N/A pick lists, typed measurements and notes, in five sections (below) | About 50 required fields, all typed on the on screen keyboard. It took the mechanic about 4 minutes on a job with nothing wrong |
| 6 | 4:15 | End of the Service Record | General Job Notes, Technician Name (pick list), **Signature** drawn with a finger (required), Date | The checklist is signed by the mechanic |
| 7 | 4:40 | **Task Status** | Actions Taken (free text: oil litres and grade, filter part, "Replaced park light bulb", odometer in km). Result: All Works Completed, More To Do, or More To Do, Task Created. Not Executed Reason: Additional Parts/Labour Required | The odometer only exists inside this text. It is why the advisor retypes it onto the vehicle |
| 8 | 5:40 | Complete | Warning "Some time entries are missing end timestamps". The mechanic goes back to Time, ticks End Current Activity (8:29) and completes. Task shows Completed 8:23 to 8:29 | **Stopping the clock is a separate step** the app nags about. Easy to forget |
| 9 | 6:40 | **Files** | Upload a file (10 MB max) with a required description. Opened but not used | Photos are possible but not part of the routine |

**The checklist (Service Record) sections and items**

| Section | Items | Kind |
|---|---|---|
| Road test | Wipers, Air Con H, Air Con C, Wheel Alignment, Lights On Dash, 4WD Operation, then Notes/Noises | Pass, Fail, N/A and a note |
| Lights check | Indicators, Park Lights, Low Beam, High Beam, Brake Lights, Reverse Lights, Fog Lights, Spotlights/Lightbar, then Lights Check Notes | Pass, Fail, N/A and a note |
| Under bonnet | Brake Fluid, Washer Bottle, Cooling System, Power Steer, Drivebelts, Spark Plugs, Air Filter, Cabin Filter, MAF Sensor, Battery Actual CCA, Battery Specified CCA | Pass, Fail, N/A. CCA values typed |
| Under vehicle checks | Brake Pads Front and Rear, Brake Rotors Front and Rear, Rotor Diameter, Steering, Suspension, Driveline, Engine/Gearbox Mounts, Front and Rear Diff Oils, Auto Transmission/Gearbox Oil, Transfer Case Oil, Exhaust | Pads and rotors are **free text** ("6mm both sides", "G"). The rest Pass, Fail, N/A |
| Stage 5 checklist, tyres | Size/Tread Pattern, PSI Before and After for LF, RF, LR, RR and spare, Tread depth for the same five, Tyres Notes | All free text, up to 300 characters ("38", "7mm") |
| Sign off | General Job Notes, Technician Name, Signature, Date | Text, pick list, drawn signature |

### Gaps: what our mechanic view must do

| Gap | Today on the tablet | What our app needs | NetSuite action and direction | Status |
|---|---|---|---|---|
| M1. Checklist content | Five sections, about 50 required items | Seed our default service checklist with these sections and items so nothing the workshop relies on is lost. Our `ChecklistItem` needs sections, a third result (N/A) and per wheel readings | **Write** results to the FSM service record so the Job Service Report still prints, or print our own report. Record type to find (the service record behind the "Service Record" tab on the case) | Decide with R1 and R2 |
| M2. Readings as numbers | Pads, rotors, pressures, tread and CCA typed as text ("6mm both sides") | Number pads with units and quick values (before and after pressure side by side, the same value for all four wheels in one tap). Pass or fail can follow from limits (pads under 3 mm, tread under 3 mm) | Write as text in the FSM format if written back | App design |
| M3. Speed | Every field required, typed on a keyboard | Big Pass buttons per section with "all pass" for the section, and only failures need a note or photo | None | App design, the main win for mechanics |
| M4. Time clock | Start opens a time entry. Ending it is a separate tick, and the item and 0.25 h are preset | Starting and completing the job starts and stops the clock. Pausing (waiting parts, lunch) is one tap | **None as it happens.** Times stay in Supabase (see "NetSuite independence" in supabase-handover.md). At completion, the total can go with the completion event if FSM time bills are still wanted. Never write `timebill` directly | Decide whether FSM time bills are still needed |
| M5. Completion | Actions Taken free text, Result and Not Executed Reason | Separate fields for oil grade and litres, filter part, extras and odometer, plus Result and reason from fixed lists. The app composes the Actions Taken text in the same order | **Write** `custevent_nx_actions_taken`, `custevent_nxc_task_result`, `custevent_nxc_reason_not_resolved` through the RESTlet | Field IDs confirmed in the schema. Value lists to read |
| M6. Odometer | Only inside Actions Taken | Its own required field at completion, checked against the last reading | **Write** the vehicle (`custrecord_nxc_na_odometerunit`) and the case (`custevent_odometer_reading`) | Removes the advisor's retyping (walkthrough R7) |
| M7. Signature | Drawn signature on the checklist | The signed in mechanic is the sign off, recorded in the activity log. Ask whether a drawn signature is still wanted on the printed report | None, or an image on the report | Ask |
| M8. Photos | Files, with a required description, rarely used | Photos on a failed item or finding, one tap, no description needed | **Write** to the File Cabinet on the case later, or keep in Supabase Storage with a link | As already planned for findings |
| M9. What the mechanic sees | Task list with a map; sales order and service history in the menu | The bay or lane list for today, no map. Service history and the vehicle's service notes on the job. Order lines without prices | **Read** only | Mechanics see no money (RLS) |
| M10. Findings to the advisor | None. The advisor reads the printed report and spots the Fails | Each Fail becomes a finding the advisor sees straight away, with the suggested part and labour, ready for the phone call and approval (R3a) | None until approved | Our finding flow already does this |

### Questions for the customer

1. Must the Job Service Report keep printing from NetSuite, or can our app produce it?
2. Which checklist items are on every service, and which only on some vehicles (4WD Operation, Transfer Case Oil, Spotlights)?
3. Is a drawn mechanic signature needed, and is the customer signature (Job Completion & Signatures) used?
4. What limits make a pad, rotor or tread reading a Fail?

## What the walkthroughs change in the design

The design changes that follow from the walkthroughs (trade blocks, collection date, booking from a sold order, approvals, parts receipts, who invoices, customer messages and the mechanic's tablet) are collected in [supabase-handover.md](supabase-handover.md), "Target design changes from the NetSuite walkthroughs".

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
