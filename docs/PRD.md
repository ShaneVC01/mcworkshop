# Product Requirements Definition: McCormack 4x4 Workshop Operations Platform

## Executive product definition

McCormack 4x4 should not attempt to recreate Oracle NetSuite Field Service Management screen-for-screen. The better product strategy is to make **NetSuite the transactional system of record while replacing the day-to-day FSM user experience with a purpose-built automotive workshop application** optimized for service advisors, workshop controllers, mechanics, and managers.

Oracle positions NetSuite Field Service Management around a generalized field-service model: operations staff create service cases and tasks, schedulers allocate tasks to field resources on a Schedule Board, technicians execute tasks in FSM Mobile, and completed work flows back into NetSuite for billing and follow-up. FSM supports resource calendars, assigned and unassigned work, technician task status, time, parts, expenses, service reports, and offline mobile operation. citeturn802619search1turn727719search2 That generic architecture is useful because most of the underlying business objects McCormack needs already exist, but the proposed application should reorganize those capabilities around the very different mental model of an automotive workshop.

The product should therefore be conceived as **McCormack Workshop OS**, a responsive web application consisting of three tightly connected experiences:

1. **Workshop Planner** — a visual capacity, booking and dispatch workspace for service advisors and workshop controllers.
2. **Service Advisor Workspace** — rapid customer/vehicle lookup, service selection, quotation, authorization, check-in and customer communication.
3. **Mechanic Workspace** — an extremely simple tablet/mobile interface for technicians to identify vehicles, execute service checklists, clock work, report findings, photograph defects, request additional work and complete jobs.

The distinguishing design principle is that users should think in terms of **vehicles, registration numbers, service jobs, bays, technicians, hours and customer promises**, rather than cases, CRM tasks, NetSuite records or FSM navigation hierarchies.

This approach also mirrors the strongest patterns in specialist automotive systems. Tekmetric emphasizes repair orders, technician assignment, digital vehicle inspections, time clocks, technician boards and customer authorization; Shop-Ware emphasizes a single-screen workflow, color-coded repair-order status, capacity and rapid hand-offs; Mitchell 1 organizes its workflow around appointment → inspection → estimate → approval → repair → invoice. citeturn253397search4turn253397search5turn253397search6turn253397search7 Academic research into automotive service operations likewise recommends real-time electronic scheduling, visual workload management, parts availability checks, proactive customer communication and rapid rescheduling as core workshop practices. citeturn253397search2

### Product vision

> A mechanic should be able to open a vehicle, understand exactly what needs doing, record progress and findings, and move to the next job without knowing NetSuite exists. A service advisor should be able to answer “When can you fit my vehicle in, what will it cost, and when will it be ready?” from one screen.

The prototype should prove five propositions:

| Proposition | Prototype proof |
|---|---|
| Workshop availability can be understood instantly | Capacity calendar showing mechanics, bays and available hours |
| Telephone bookings can be created rapidly | Registration/customer search → service selection → available slot → booking |
| Quotes can be assembled without traversing NetSuite | Service templates, labor, parts and price displayed in one workspace |
| Mechanics can work almost entirely through touch | Today's jobs, large controls, checklist, findings, photos and completion |
| NetSuite remains authoritative | Adapter layer reads/writes the relevant NetSuite/FSM objects |

Oracle's current FSM Schedule Board already exposes resources, working hours, assigned work and availability and allows drag-and-drop task reassignment. It also refreshes visible schedule data automatically and supports task colors, statuses, non-working periods and unassigned-task filtering. citeturn727719search3turn727719search5 The opportunity is therefore not to invent the scheduling data from scratch, but to expose it in an automotive-specific representation.

## Users, operating model and information architecture

### Primary personas

**Service Advisor / Booking Coordinator**

This person spends significant time on the telephone and needs answers in seconds. Their main questions are:

- Who is the customer?
- What vehicle is this?
- What does it need?
- What work was previously done?
- What will it cost?
- How long will it take?
- When can we fit it in?
- Can we make a promise to the customer?

The interface should prioritize search and keyboard efficiency, while eliminating unnecessary page navigation.

**Workshop Controller / Operations Manager**

This user runs the workshop minute by minute. They need to see:

- available technician hours;
- bookings versus capacity;
- jobs currently in progress;
- jobs running behind;
- technicians waiting for work;
- vehicles waiting for approval;
- vehicles waiting for parts;
- unassigned work;
- bay utilization;
- expected completion times.

Specialist automotive workflow systems make workload and technician allocation first-class concepts because technician assignment permits dispatchers to see workload and allows actual technician time to be compared against billed labor time. citeturn253397search8turn253397search10

**Mechanic / Technician**

The mechanic should have almost no exposure to administrative concepts. The application should answer four questions:

**What vehicle am I working on? → What do I need to do? → What have I found? → Am I finished?**

The primary device should be assumed to be a rugged tablet or ordinary phone used in a workshop environment. Controls therefore need large touch targets, high contrast, minimal typing and minimal navigation depth.

**Workshop Manager**

The manager needs aggregated capacity and performance measures:

- booked available hours;
- productive hours;
- actual versus estimated hours;
- technician utilization;
- jobs completed on time;
- WIP aging;
- approval waiting time;
- utilization by bay;
- rework/comeback rate where available.

Automotive workshop operating models commonly distinguish booked capacity, available capacity, productive time, parts readiness, approval delays and work-in-progress age because each identifies a different source of workshop loss. citeturn253397search1turn253397search3

### Navigation model

The desktop application should have only six persistent navigation destinations:

**Today | Calendar | Bookings | Vehicles | Workshop | Reports**

Mechanic users receive a separate role-specific shell:

**My Day | Current Job | Completed**

Administrative functions such as configuration and integration diagnostics should live behind an administrator menu rather than contaminating operational navigation.

### Global search

Every operational screen should contain a prominent search box supporting:

- registration number;
- VIN;
- customer name;
- mobile number;
- booking number;
- job/repair-order number.

Registration number should be the primary vehicle identifier presented to workshop staff, although the NetSuite internal ID or another durable identifier should remain the integration key.

A successful search should return a vehicle summary card containing:

**Registration · Make/model · Customer · Odometer · Last service · Next appointment · Current status**

Selecting the card opens the vehicle timeline rather than exposing a NetSuite record page.

## Functional product requirements

### Workshop Planner and intelligent booking calendar

This is the most important desktop screen in the product.

The default view should be **Day**, with optional Week and Capacity views.

Each mechanic occupies a row. Time runs horizontally. Jobs appear as draggable blocks. A second optional dimension represents workshop bays.

A typical screen concept is:

```text
MON 9 NOV         07:00  08:00  09:00  10:00  11:00  12:00  13:00...

Workshop load     ███████████████░░░░░████████████░░░░
Booked             31.5h
Available          42.0h
Free               10.5h

JAMES             [ D-MAX SERVICE -------- ][    FREE    ][ HILUX BRAKES ---]
                   Rego: 923XYZ                   Rego: 117ABC

PETER             [     FREE      ][ RANGER DIAG ----------- ][ FREE -------]

LUKE               [ LC79 SUSPENSION ------------------------ ][  FREE       ]

Unassigned jobs    [ Prado 120K service 3.5h ] [ Patrol noise 2h ]
```

NetSuite's own FSM scheduler demonstrates that the underlying product can represent resources, working hours, task start/end dates, assignment, unassignment, date changes and task colors. citeturn727719search2turn727719search3 McCormack's interface should simplify these primitives into automotive capacity.

#### Calendar color semantics

Color should convey **operational state**, never simply decoration.

Recommended initial states:

| Visual state | Meaning |
|---|---|
| Neutral/free area | Available capacity |
| Green | Confirmed and ready |
| Blue | Vehicle checked in / queued |
| Purple | Work in progress |
| Amber | Waiting for customer approval |
| Orange | Waiting for parts |
| Red | Blocked / overdue / at-risk |
| Grey | Technician unavailable |
| Hatched block | Tentative booking |

Color must always be paired with text/iconography for accessibility.

The planner must support:

- technician working hours;
- leave and unavailable time;
- technician skills;
- bay/resource requirements;
- estimated service duration;
- drag-and-drop booking;
- drag-and-drop technician reassignment;
- resize-to-change duration;
- multi-technician jobs;
- unassigned work;
- tentative reservations;
- overbooking warning;
- hard resource conflicts;
- search and filters;
- today's capacity summary;
- utilization percentages;
- late-job indicators;
- parts-readiness indicator.

The planner should distinguish **technician availability** from **bay availability**. A free technician does not necessarily mean the workshop can accept a vehicle if the required bay or equipment is unavailable. Automotive scheduling guidance specifically recommends planning technician skills, expected job duration, parts and physical resources together rather than using a simple appointment calendar. citeturn253397search0turn253397search1turn253397search3

#### Capacity model

For each technician and day:

```text
Available Hours
= Working Shift
- Breaks
- Leave
- Training
- Other blocked time

Booked Hours
= Sum of scheduled estimated labor

Free Hours
= Available Hours - Booked Hours

Utilization %
= Booked Hours / Available Hours × 100
```

The system should also calculate shop-wide capacity and optionally capacity by skill category.

Example:

```text
MONDAY
Available                 48.0 mechanic hours
Confirmed                 34.5
Tentative                  4.0
Free                       9.5
Booked utilization         72%
Potential utilization      80%
```

### Fast booking workflow

The booking journey should fit primarily into a single screen or slide-over panel.

**Step A — Identify customer/vehicle**

Search by registration first.

If found:

```text
923 XYZ
2021 Toyota LandCruiser 79
John Smith
142,834 km
Last visit: 16 Aug 2026
```

If not found, allow quick creation of customer and vehicle.

**Step B — Record customer requirement**

Provide large selectable options:

```text
Scheduled Service
Repair / Fault
Inspection
Accessory Installation
Suspension
Electrical
Diagnostic
Other
```

For faults, capture customer wording verbatim.

Example:

> "Knocking from left front when turning slowly."

This should remain distinct from technician diagnosis.

**Step C — Select service template**

A service template should produce:

- estimated labor hours;
- required skill;
- expected bay type;
- standard labor operations;
- expected parts;
- base quote;
- checklist;
- recommended lead time.

Examples:

```text
Toyota LC79 10,000 km service       2.0 h
Toyota LC79 40,000 km service       3.5 h
Suspension inspection               1.0 h
Wheel bearing replacement           2.8 h
Pre-trip inspection                 1.5 h
```

Automotive systems commonly use reusable or "canned" jobs to eliminate repetitive estimate entry. Tekmetric, for example, supports reusable Smart Jobs and mapping them into inspection findings. citeturn253397search4turn253397search5

**Step D — Find capacity**

Click **Find next availability**.

The system evaluates:

```text
technician availability
+ skill requirements
+ duration
+ bay requirement
+ operating hours
+ existing bookings
+ optionally parts readiness
```

It then presents:

```text
BEST OPTIONS

Mon 9 Nov     10:30     James     2.5h contiguous     ✓
Mon 9 Nov     13:00     Peter     2.5h contiguous     ✓
Tue 10 Nov     7:30     Luke      4.0h available      ✓
```

The advisor can select a recommendation or manually place the booking.

**Step E — Price and confirm**

The same panel shows:

```text
LABOUR                           $___
PARTS                            $___
OTHER                            $___
------------------------------------
ESTIMATE                         $___

Drop-off: 07:30
Expected ready: 15:30
```

Clicking **Confirm Booking** should create/update the associated NetSuite/FSM records and return a McCormack booking identifier.

The prototype should support **booking in fewer than 60 seconds for a known customer with a known vehicle and standard service** as a target usability requirement.

### Workshop command board

The Calendar optimizes future capacity. The **Workshop** view optimizes today's execution.

Use vertical status columns:

```text
ARRIVING        CHECKED IN       IN PROGRESS       APPROVAL       PARTS       READY

LC79 923XYZ     D-MAX 762JKL     Prado 881GHT      Ranger...      Patrol...   Hilux...
07:30           08:00            James             $1,240         ETA 14:00
2.0h            Service          63%                22m waiting
```

Cards should support drag-and-drop status movement subject to business rules.

Each job card displays only the operational essentials:

- registration;
- vehicle;
- technician;
- promised completion;
- progress;
- estimated remaining hours;
- customer approval status;
- parts status;
- warning/blocked state.

Shop-Ware's workflow approach demonstrates the usefulness of one-screen repair-order status, color-coded labels, work-complete percentage and rapid status visibility. citeturn253397search6

### Service advisor job workspace

Opening a booking should produce one consolidated page.

Header:

```text
923 XYZ     Toyota LC79       JOHN SMITH
IN PROGRESS • James • Bay 3 • Expected 15:30

[Call] [SMS] [Quote] [Reschedule] [Open NetSuite]
```

Tabs:

```text
OVERVIEW | WORK | FINDINGS | QUOTE | HISTORY | ACTIVITY
```

**Overview** contains customer concern, booking information and operational state.

**Work** contains individual labor operations and estimated/actual time.

**Findings** contains mechanic observations and inspection results.

**Quote** turns findings into customer-authorizable work.

**History** gives a vehicle-centric timeline.

**Activity** provides an immutable operational activity feed.

### Vehicle timeline

One of the highest-value improvements over generic ERP navigation should be a single vehicle history.

Example:

```text
923 XYZ • Toyota LC79

09 NOV 2026
120,000 km service
✓ Oil/filter
✓ Brake inspection
! Front pads 20%
! LHF wheel bearing play

16 AUG 2026
Suspension inspection
✓ Completed

04 FEB 2026
100,000 km service
✓ Completed
```

The timeline should combine service history and current recommendations without requiring staff to locate separate NetSuite records.

### Mechanic home screen

The mechanic experience should default directly to **My Day** after sign-in.

```text
Good morning, James

NOW
┌────────────────────────────────────┐
│ 923 XYZ                            │
│ Toyota LandCruiser 79              │
│ 120,000 km Service                 │
│ Est. 3h 30m                        │
│                                    │
│          CONTINUE JOB              │
└────────────────────────────────────┘

NEXT
11:30  772 KLM   Ranger   Brakes
14:00  818 ABC   D-MAX    Diagnostic
```

No left-hand ERP navigation should appear.

The mechanic can also tap **Scan / Enter Registration**.

### Mechanic job screen

The mechanic job view should use a step-based structure:

```text
923 XYZ
TOYOTA LANDCRUISER 79

[ STARTED 08:42 ]       01:18 elapsed

1  CUSTOMER CONCERN              ✓
2  SERVICE CHECKLIST             14 / 21
3  FINDINGS                       2
4  PARTS USED                     3
5  NOTES & PHOTOS
6  COMPLETE JOB

[ PAUSE ]              [ COMPLETE ]
```

Oracle's FSM Mobile already supports technician task details, status changes, customer/asset information, subtasks, time, parts and offline synchronization. citeturn727719search0turn727719search2 The new interface should preserve these business capabilities while aggressively simplifying the presentation.

### Service checklist

Checklist interaction must be fast enough to operate with dirty hands.

Recommended input:

```text
ENGINE OIL                       ✓ OK   ! ATTENTION
COOLANT                          ✓ OK   ! ATTENTION
BRAKE FLUID                      ✓ OK   ! ATTENTION
FRONT PADS                       ✓ OK   ! ATTENTION
REAR PADS                        ✓ OK   ! ATTENTION
TYRE FL                          38 psi
TYRE FR                          38 psi
TYRE RL                          40 psi
TYRE RR                          40 psi
```

Optional tri-state inspection:

**Green — OK**  
**Amber — Monitor / Recommended**  
**Red — Requires attention**

Tapping Amber or Red opens a finding sheet:

```text
Finding
Front brake pads

Severity
[ Monitor ] [ Recommended ] [ Safety ]

Description
[ Pads approximately 2 mm ]

Photo
[ TAKE PHOTO ]

Suggested action
[ Replace front brake pads ]

Estimated additional labor
[ 1.5 h ]

[ SAVE FINDING ]
```

Digital inspections with documented findings and photographs are a standard pattern in contemporary automotive workshop software because they connect mechanic findings to estimating and customer authorization. citeturn253397search4turn253397search5turn253397search7

### Additional-work approval loop

The mechanic must not become a service advisor.

The technician submits the finding:

```text
FINDING SUBMITTED
Front brake pads — Safety
```

The operations screen immediately moves the relevant repair operation to **Waiting for Approval**.

The advisor can convert the finding into a quote:

```text
Replace front brake pads
Parts                 $___
Labour 1.5 h          $___
Total                 $___

[ SEND FOR APPROVAL ]
```

Status becomes:

```text
WAITING FOR CUSTOMER • 00:18
```

When approved:

```text
APPROVED • $___
```

The mechanic receives:

```text
ADDITIONAL WORK APPROVED
Replace front brake pads
+1.5 hours
```

This approval state should be independent from the overall vehicle status so that work already authorized can continue where appropriate.

### Time tracking

Mechanics should be able to:

**Start → Pause → Resume → Complete**

Time can be associated with the entire job or individual operations.

NetSuite FSM has native service-time handling that captures start/end information and can create associated time bills when a technician completes a task; Oracle documents a sequence in which task fields and status are updated while the time record is created. citeturn727719search4 Because this processing has lifecycle side effects, the prototype integration must map carefully onto McCormack's actual FSM configuration rather than directly manipulating completion fields without validation.

Recommended metrics:

```text
Estimated labor       3.5 h
Actual clock time     2.8 h
Progress              80%
Remaining estimate    0.7 h
```

Mechanic users should not see profitability figures unless explicitly enabled.

### Completion

The mechanic cannot complete a job while required checklist fields remain unresolved.

Completion sheet:

```text
JOB COMPLETION

✓ Required checklist complete
✓ Required readings entered
✓ Findings submitted
✓ Parts usage recorded

Mechanic summary:
[ Vehicle serviced. Front brake pads replaced.
  Road tested. No further concerns. ]

Odometer:
[ 143,218 km ]

[ COMPLETE JOB ]
```

A completion event then updates NetSuite through the integration layer.

## NetSuite integration and technical architecture

### Architectural principle

Do **not** allow the browser application to call NetSuite directly.

Recommended topology:

```text
                    McCORMACK WORKSHOP UI
                 Desktop / Tablet / Mobile
                           │
                           │ HTTPS
                           ▼
                 WORKSHOP APPLICATION API
                ┌──────────────────────────┐
                │ Auth / RBAC              │
                │ Workshop domain services │
                │ Booking engine           │
                │ Capacity engine          │
                │ Audit log                │
                │ Cache                    │
                │ Sync/outbox              │
                └──────────────────────────┘
                     │               │
                Local DB         Job Queue
                     │               │
                     └───────┬───────┘
                             ▼
                    NETSUITE ADAPTER
                  REST WS / SuiteQL /
                 RESTlets where required
                             │
                             ▼
                      ORACLE NETSUITE
                   + FSM / custom records
```

SuiteTalk REST Web Services provide CRUD access to records, record metadata, record queries, record actions, transformations, SuiteQL and dataset execution. Oracle notes that REST web services avoid the need to build a RESTlet for operations already supported by the standard API. citeturn802619search5turn727719search7 RESTlets should therefore be reserved for workflows or FSM-specific operations not exposed appropriately by standard REST records.

Oracle's FSM SuiteApp itself exposes Suitelet and RESTlet deployments, including scheduler and mobile endpoints, but Oracle's FSM API documentation explicitly describes its supplied API code as sample material that may not suit a particular use case. citeturn802619search0turn802619search2 Consequently, the implementation should **not assume undocumented FSM internals are a stable public API contract**. During discovery, each required operation should be classified into one of three supported pathways:

```text
A. Standard SuiteTalk REST record
B. SuiteQL/read model
C. Supported/custom RESTlet for FSM-specific behavior
```

### Recommended integration strategy

**Reads**

Use SuiteQL or REST query endpoints for aggregated read use cases such as:

- calendar date range;
- mechanics/resources;
- bookings;
- utilization;
- customer/vehicle search;
- vehicle history;
- open tasks;
- work statuses.

Oracle supports executing SuiteQL through the REST query service. citeturn727719search7

**Writes**

Use standard record APIs wherever the underlying record is supported.

Examples include:

- customer updates;
- appointment/task changes;
- appropriate transactions;
- custom records;
- item-related changes.

NetSuite's REST record service supports create, retrieve, update and delete operations, including custom fields and custom records where supported. citeturn802619search5turn802619search6

**FSM behavior**

Use a controlled RESTlet if the required FSM state transition must trigger FSM logic that cannot safely be reproduced via ordinary record writes.

This is especially important for actions such as:

- starting/finishing FSM work;
- service reports;
- task-team assignment;
- time tracking;
- FSM-specific subtasks;
- any action dependent on SuiteApp background processing.

### Authentication

Use **OAuth 2.0** between the integration service and NetSuite. Oracle identifies OAuth 2.0 as the preferred authentication mechanism for REST web services and RESTlets, and supports both authorization-code and client-credentials configurations for integrations. citeturn802619search7turn727719search8

Do not create a new integration based on username/password credentials. Oracle is actively retiring older authentication approaches: its current documentation states that RESTlet user-credential support ends in NetSuite 2027.1 and TBA support ends in 2028.2. citeturn802619search8turn727719search10

### NetSuite adapter contract

The coding agent should create a provider interface so that the front-end application is independent of NetSuite implementation detail.

```ts
interface WorkshopERPProvider {
  searchVehicles(query: string): Promise<Vehicle[]>;
  getVehicle(vehicleId: string): Promise<VehicleDetail>;
  getVehicleHistory(vehicleId: string): Promise<ServiceVisit[]>;

  searchCustomers(query: string): Promise<Customer[]>;
  getCustomer(customerId: string): Promise<Customer>;

  getResources(range: DateRange): Promise<Technician[]>;
  getSchedule(range: DateRange): Promise<Booking[]>;
  getAvailability(request: AvailabilityRequest): Promise<Slot[]>;

  createBooking(input: CreateBookingInput): Promise<Booking>;
  updateBooking(id: string, patch: BookingPatch): Promise<Booking>;
  assignTechnician(jobId: string, technicianId: string): Promise<void>;

  getJob(jobId: string): Promise<WorkshopJob>;
  startJob(jobId: string, technicianId: string): Promise<void>;
  pauseJob(jobId: string, reason?: string): Promise<void>;
  resumeJob(jobId: string): Promise<void>;
  completeJob(jobId: string, completion: JobCompletion): Promise<void>;

  updateChecklist(jobId: string, item: ChecklistResult): Promise<void>;
  addFinding(jobId: string, finding: Finding): Promise<Finding>;
  addAttachment(jobId: string, attachment: Attachment): Promise<void>;

  getQuote(jobId: string): Promise<Quote>;
  updateQuote(jobId: string, changes: QuotePatch): Promise<Quote>;
  setApprovalStatus(jobId: string, status: ApprovalStatus): Promise<void>;
}
```

Implement two providers for the prototype:

```text
MockWorkshopProvider
NetSuiteWorkshopProvider
```

The mock provider allows the product to be demonstrated before the exact McCormack NetSuite schema has been mapped.

### Canonical data model

The UI should operate on a domain model that does not expose NetSuite terminology.

```text
Customer
 └── Vehicles
      └── ServiceVisits / Jobs
           ├── Booking
           ├── LaborOperations
           ├── Checklist
           ├── Findings
           ├── Parts
           ├── TimeEntries
           ├── Quote
           └── ActivityEvents

Technician
 ├── Skills
 ├── WorkingCalendar
 ├── Bookings
 └── TimeEntries

Bay
 ├── Capabilities
 └── Bookings
```

Suggested canonical objects:

```ts
type Vehicle = {
  id: string;
  registration: string;
  vin?: string;
  make: string;
  model: string;
  year?: number;
  odometer?: number;
  customerId: string;
};

type Technician = {
  id: string;
  name: string;
  skills: string[];
  shiftStart: string;
  shiftEnd: string;
  active: boolean;
};

type Booking = {
  id: string;
  vehicleId: string;
  customerId: string;
  technicianIds: string[];
  bayId?: string;
  startAt: string;
  endAt: string;
  estimatedLaborHours: number;
  status: BookingStatus;
  readiness: "ready" | "parts-risk" | "unknown";
};

type WorkshopJob = {
  id: string;
  bookingId: string;
  vehicle: Vehicle;
  customerConcern: string;
  operations: LaborOperation[];
  checklist: ChecklistItem[];
  findings: Finding[];
  timeEntries: TimeEntry[];
  status: JobStatus;
  promisedAt?: string;
};

type Finding = {
  id: string;
  category: string;
  severity: "monitor" | "recommended" | "safety";
  description: string;
  photos: string[];
  suggestedOperation?: string;
  approvalStatus:
    | "not-required"
    | "draft"
    | "awaiting-customer"
    | "approved"
    | "declined";
};
```

### Mapping discovery table

The following mapping is deliberately expressed as **to-be-confirmed**, because NetSuite account configuration and FSM customizations vary.

| Canonical concept | Likely NetSuite/FSM source | Must confirm |
|---|---|---|
| Customer | Customer record | Internal/customer fields |
| Vehicle | FSM Asset or McCormack custom vehicle record | Actual implementation |
| Registration | Asset/custom field | Field ID |
| VIN | Asset/custom field | Field ID |
| Booking | CRM/Project Task, Case-related task or custom record | McCormack workflow |
| Workshop job | FSM Case + Task structure | Exact relationship |
| Mechanic | Employee/resource | FSM eligibility |
| Assignment | Task assignment/team | Actual field structure |
| Schedule start/end | Task scheduling fields | Date/time fields |
| Job status | Task/FSM status | Status mapping |
| Checklist | FSM subtasks/custom records | Existing implementation |
| Parts used | Transaction/item usage/FSM data | Posting process |
| Mechanic time | FSM time tracking/time bill | Current configuration |
| Quote | Estimate or other transaction | Current sales process |
| Photos | File Cabinet attachment | Existing conventions |
| Service report | FSM service-report functionality | Required/optional |

Oracle documents FSM's underlying scheduling events as NetSuite CRM and Project tasks, and its configuration permits mappings of resource, event, calendar and status data. citeturn727719search5turn727719search6 This is strong evidence that an adapter approach is feasible, but the McCormack account must be inspected before final field mappings are hard-coded.

### Sync strategy

The application should use a **local operational read model**, rather than repeatedly calling NetSuite every time the user pans a calendar or changes a filter.

Recommended behavior:

```text
USER ACTION
    │
    ├── Read → local/cache projection
    │
    └── Write → Workshop API
                  │
                  ├── Validate
                  ├── Persist intent/event
                  ├── Send to NetSuite
                  ├── Confirm
                  └── Update projection
```

For critical actions such as booking creation, the UI should show:

```text
Saving...
Confirmed in NetSuite ✓
```

If synchronization fails:

```text
Booking saved locally but NetSuite synchronization failed.
Retrying automatically.
```

Never silently discard a write.

### Integration robustness

NetSuite applies account-level concurrency governance across web-service and RESTlet requests, and Oracle provides an API operation to retrieve available concurrency limits. citeturn418446search0turn418446search2 The connector should therefore use a queue with bounded concurrency rather than allowing every browser interaction to initiate uncontrolled parallel requests.

NetSuite returns HTTP 429 when concurrency limits are exceeded, and Oracle recommends delayed retries with increasing intervals while avoiding synchronized retry spikes. citeturn418446search1turn418446search3 Implement exponential backoff with jitter.

For safe synchronization, use external IDs and idempotency keys where supported. Oracle specifically recommends external IDs/upsert patterns to reduce duplicate creation, and its asynchronous batch APIs support `X-NetSuite-idempotency-key`. citeturn418446search5turn418446search6turn418446search9

Every integration error should generate:

```text
timestamp
user
action
canonical record ID
NetSuite record ID if known
request correlation ID
HTTP status
NetSuite error code
retry count
resolution status
```

## Prototype UX specification and coding-agent brief

### Technology recommendation

For the prototype, use:

```text
Frontend:
Next.js / React / TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
FullCalendar Scheduler or equivalent resource timeline
React Hook Form + Zod

Backend:
Next.js server APIs or Node/NestJS
TypeScript
PostgreSQL
Prisma ORM
Redis optional for caching/queues

Auth:
Microsoft Entra ID / OIDC if available
otherwise prototype credentials + RBAC abstraction

Storage:
Object storage abstraction for mechanic photos

Integration:
NetSuite provider interface
OAuth 2.0
SuiteTalk REST
SuiteQL
RESTlet adapter when necessary
```

The architectural requirement matters more than the specific framework: **front-end components must never depend directly on NetSuite field IDs**.

### Required prototype screens

The coding agent should deliver these screens as functioning interactive prototypes:

| Route | Screen |
|---|---|
| `/today` | Operational summary |
| `/calendar` | Workshop resource calendar |
| `/bookings/new` | Fast booking workflow |
| `/bookings/:id` | Booking/service advisor workspace |
| `/workshop` | Workshop command board |
| `/vehicles/:id` | Vehicle history |
| `/mechanic` | Mechanic My Day |
| `/mechanic/jobs/:id` | Mechanic job |
| `/mechanic/jobs/:id/inspection` | Checklist |
| `/mechanic/jobs/:id/findings/new` | Finding capture |
| `/reports` | Utilization dashboard |
| `/admin/integration` | NetSuite sync diagnostics |

### Calendar prototype requirements

Seed at least:

- six mechanics;
- four workshop bays;
- twenty vehicles;
- thirty bookings across a working week;
- technician leave;
- one absent technician;
- one over-capacity day;
- unassigned jobs;
- waiting-for-parts jobs;
- waiting-for-approval jobs.

Calendar interactions must include:

```text
✓ Drag booking between technicians
✓ Drag booking in time
✓ Resize booking
✓ Click empty space → create booking
✓ Click booking → preview
✓ Filter by mechanic
✓ Filter by skill
✓ Toggle day/week
✓ Show capacity bar
✓ Show unassigned drawer
✓ Show conflict warning
```

### Mock dataset

Use realistic 4x4-oriented demonstration data:

```text
Vehicles:
Toyota LandCruiser 79
Toyota LandCruiser 200
Toyota Prado
Ford Ranger
Isuzu D-MAX
Nissan Patrol
Mitsubishi Triton

Jobs:
10,000 km service
40,000 km service
120,000 km major service
Suspension inspection
Brake replacement
Wheel bearing repair
Accessory fitment
Electrical diagnosis
Pre-trip inspection
```

Do not imply manufacturer service schedules are accurate unless actual data is subsequently integrated.

### Mobile/mechanic design constraints

Minimum mechanic design requirements:

- no hover-dependent interaction;
- no nested menus;
- primary actions visible without scrolling where practical;
- 48 px or larger primary touch targets;
- registration visible in every job screen;
- autosave checklist entries;
- camera capture in one action;
- maximum two taps from job screen to finding capture;
- high-contrast status states;
- portrait tablet first;
- responsive phone fallback;
- resilient against brief connectivity loss.

Because Oracle FSM Mobile itself supports offline task access and later synchronization, offline resilience is a reasonable requirement if McCormack mechanics experience unreliable workshop connectivity. citeturn727719search0turn727719search2 Full offline mode can, however, remain outside the first prototype.

### State model

Use explicit job states rather than arbitrary strings.

```text
BOOKED
  ↓
CONFIRMED
  ↓
CHECKED_IN
  ↓
READY_FOR_WORK
  ↓
IN_PROGRESS
  ├──────────────→ WAITING_APPROVAL
  ├──────────────→ WAITING_PARTS
  ├──────────────→ BLOCKED
  ↓
TECH_COMPLETE
  ↓
QUALITY_CHECK
  ↓
READY_FOR_CUSTOMER
  ↓
CLOSED
```

Allow contextual transitions back to `IN_PROGRESS`.

Every state transition must create an activity event.

### Activity event model

```ts
type ActivityEvent = {
  id: string;
  jobId: string;
  type:
    | "booking.created"
    | "booking.rescheduled"
    | "technician.assigned"
    | "vehicle.checked_in"
    | "job.started"
    | "job.paused"
    | "finding.created"
    | "quote.sent"
    | "quote.approved"
    | "quote.declined"
    | "parts.waiting"
    | "job.completed";
  actorId: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};
```

This event history should power the activity timeline and assist reconciliation with NetSuite.

### Role permissions

| Function | Advisor | Controller | Mechanic | Manager | Admin |
|---|---:|---:|---:|---:|---:|
| View calendar | ✓ | ✓ | Own | ✓ | ✓ |
| Create booking | ✓ | ✓ | — | ✓ | ✓ |
| Move booking | ✓ | ✓ | — | ✓ | ✓ |
| Quote | ✓ | ✓ | — | ✓ | ✓ |
| Start mechanic job | — | — | ✓ | ✓ | ✓ |
| Inspection | — | — | ✓ | ✓ | ✓ |
| Record finding | — | — | ✓ | ✓ | ✓ |
| Approve customer work | ✓ | ✓ | — | ✓ | ✓ |
| View utilization | Limited | ✓ | Own | ✓ | ✓ |
| Integration config | — | — | — | — | ✓ |

### Performance targets

For prototype and eventual production architecture:

```text
Initial app shell                < 2.0 sec target
Calendar navigation             < 500 ms perceived response
Vehicle/reg search              < 1.0 sec target
Checklist save                  < 300 ms perceived response
Opening mechanic job            < 1.0 sec target
Booking confirmation            immediate UI feedback;
                                final sync status separately shown
```

NetSuite latency should not dictate interaction latency for read-heavy screens; caching and projections should absorb that boundary.

### Security requirements

The production version must include:

- least-privilege NetSuite integration role;
- OAuth 2.0 secrets stored server-side only;
- role-based application access;
- TLS everywhere;
- audit trail of operational changes;
- no NetSuite credentials in client code;
- controlled attachment access;
- user identity attached to every mutation;
- logs that redact credentials and sensitive authorization data;
- server-side validation of all write requests.

OAuth 2.0 specifically avoids storing a user's NetSuite credentials in the integration application and is Oracle's preferred approach for REST integrations. citeturn802619search7turn802619search9

## Product backlog, acceptance criteria and implementation phases

### Prototype scope

The prototype should concentrate on the two workflows where McCormack expects the greatest operational improvement:

**booking/capacity management** and **mechanic execution**.

The coding agent should consider the prototype complete only when the following end-to-end scenario works:

```text
1. Advisor searches registration "923XYZ".
2. Existing customer + LandCruiser appears.
3. Advisor selects "120,000 km service".
4. System calculates required 3.5 mechanic hours.
5. Calendar displays next suitable openings.
6. Advisor selects Tuesday 07:30.
7. Booking appears on assigned mechanic's calendar.
8. Workshop controller sees the booking.
9. On Tuesday the mechanic sees it in My Day.
10. Mechanic starts job.
11. Mechanic completes checklist.
12. Mechanic records low front brake pads with photo.
13. Advisor sees finding immediately.
14. Advisor creates additional-work quote.
15. Customer status is marked approved in prototype.
16. Mechanic receives approved additional work.
17. Mechanic completes brake work.
18. Mechanic completes service.
19. Workshop board changes to Tech Complete.
20. Vehicle timeline shows the visit and findings.
```

### Must-have acceptance criteria

**Booking**

A service advisor can locate an existing vehicle by registration and reach available appointment options without navigating away from the booking workflow.

A standard job can populate estimated labor automatically.

The application prevents double-booking a mechanic unless an authorized user explicitly overrides the warning.

The calendar clearly shows booked versus available capacity.

Rescheduling requires a drag/drop or similarly direct interaction rather than reopening multiple forms.

**Mechanic**

The mechanic's current job is the dominant element of the home screen.

A mechanic can begin a job in one tap.

A mechanic can complete a checklist item in one tap.

A mechanic can create a finding with description and photograph.

Checklist changes save without a separate page-level Save button.

Required checklist items prevent premature completion.

Job completion records the mechanic and timestamp.

**Operations**

Workshop staff can see which vehicles are:

```text
waiting
in progress
waiting approval
waiting parts
blocked
complete
```

A controller can identify technician unused capacity without opening individual records.

Jobs at risk of missing promised completion are visually highlighted.

**Integration**

Every NetSuite mutation passes through one integration abstraction.

The application can run entirely against mock data.

Switching from `MockWorkshopProvider` to `NetSuiteWorkshopProvider` does not require rewriting UI components.

Failed NetSuite writes are observable and retryable.

No OAuth secret or NetSuite credential is present in browser JavaScript.

### Phase structure

**Prototype — User experience proof**

Build:

- workshop calendar;
- booking workflow;
- mechanic My Day;
- mechanic checklist;
- findings;
- mock quote/approval loop;
- workshop command board;
- vehicle timeline;
- utilization overview;
- mock ERP provider.

This phase answers: **Is this dramatically easier to use than the current workflow?**

**Integration proof**

Connect to a NetSuite sandbox and discover:

- vehicle/asset record;
- customer relationship;
- FSM cases;
- FSM tasks;
- technician resources;
- appointment dates;
- statuses;
- quotes/estimates;
- item/parts structure;
- FSM time tracking;
- checklist implementation.

Build read-only integration first, then controlled writes.

This phase answers: **Can all necessary behavior be achieved through supported integration surfaces without compromising NetSuite accounting/FSM integrity?**

**Operational pilot**

Pilot with a small cohort:

- one service advisor;
- one workshop controller;
- two or three mechanics.

Instrument:

```text
booking time
clicks per booking
search time
quote preparation time
mechanic interaction time
schedule changes
NetSuite sync failures
approval wait time
job completion accuracy
```

**Production expansion**

Add:

- customer SMS/email;
- digital customer authorization;
- parts readiness;
- richer quoting;
- service reminders;
- offline mechanic mode;
- dashboards;
- bay/equipment optimization;
- warranty/comeback workflows;
- multi-location support if required.

### Explicitly out of first prototype

Do not let the initial build expand into a replacement ERP.

Exclude initially:

- accounting;
- general ledger;
- procurement;
- payroll;
- complete inventory management;
- payment processing;
- full CRM;
- manufacturer repair information;
- sophisticated parts catalog integrations;
- AI scheduling;
- customer self-booking;
- complete invoicing replacement.

NetSuite should continue to own those back-office responsibilities unless later product discovery demonstrates a specific reason otherwise.

## Final build specification for the coding agent

The following can be provided directly as the high-level build instruction.

> Build a responsive web application called **McCormack Workshop OS** for an automotive 4x4 service workshop. NetSuite remains the ERP/system of record. The new application is a specialized operational UI that hides NetSuite complexity.
>
> Create two primary experiences: a desktop Workshop Operations application and a mobile/tablet Mechanic application.
>
> The desktop application must provide a resource timeline calendar with mechanics as rows, time horizontally, color-coded bookings, free-capacity visualization, drag/drop scheduling, booking resizing, utilization, unassigned jobs, technician absence, skill filters and bay conflicts. A user must be able to search a registration, identify the customer and vehicle, select a reusable service template, view expected labor/price, find suitable available capacity and create a booking from a single workflow.
>
> Build a Workshop Board with cards grouped into Arriving, Checked In, In Progress, Waiting Approval, Waiting Parts, Blocked and Ready.
>
> Build a Service Advisor workspace containing Overview, Work, Findings, Quote, History and Activity.
>
> Build a vehicle-centric history page in which registration number is the primary visual identifier.
>
> The mechanic app must open to My Day. Show Current Job and Next Jobs. The current job screen must provide customer concern, service checklist, findings, parts, notes/photos and Complete Job. Use large touch targets and minimal text input. Mechanics must be able to Start, Pause, Resume and Complete work. A mechanic can mark inspection items OK/Attention, record numerical measurements, photograph a defect and submit a finding. Findings can be classified Monitor, Recommended or Safety.
>
> Findings flow to the service advisor and can become additional-work quote items. Approved work flows back to the mechanic's job.
>
> Use a canonical domain model including Customer, Vehicle, Technician, Bay, Booking, WorkshopJob, LaborOperation, ChecklistItem, Finding, Quote, TimeEntry and ActivityEvent.
>
> Do not put NetSuite record types, field names or internal IDs into React components. Define a `WorkshopERPProvider` interface and implement both `MockWorkshopProvider` and `NetSuiteWorkshopProvider`. All front-end code must operate only against the canonical interface.
>
> Implement the NetSuite provider server-side. Architect it to use SuiteTalk REST Web Services and SuiteQL first and custom RESTlets only where FSM-specific operations require them. Authentication must use OAuth 2.0. Add queueing, bounded concurrency, retries with exponential backoff and jitter, idempotency support, correlation IDs and integration error logging.
>
> Seed realistic demo data containing six mechanics, four bays, twenty 4x4 vehicles, thirty bookings, unavailable technicians, unassigned work, approval delays and parts delays.
>
> Use explicit job states: `BOOKED`, `CONFIRMED`, `CHECKED_IN`, `READY_FOR_WORK`, `IN_PROGRESS`, `WAITING_APPROVAL`, `WAITING_PARTS`, `BLOCKED`, `TECH_COMPLETE`, `QUALITY_CHECK`, `READY_FOR_CUSTOMER`, `CLOSED`.
>
> Every state change creates an immutable activity event.
>
> Build role support for Advisor, Workshop Controller, Mechanic, Manager and Administrator.
>
> Optimize the entire experience around the principle that users work with **customers, registration numbers, vehicles, technicians, bays, service operations and workshop hours**—never ERP abstractions.
>
> The prototype's primary success test is that a standard booking can be made in under one minute and a mechanic can execute an entire service workflow without opening NetSuite.

The most important implementation decision is to preserve that separation. NetSuite already provides the durable ERP, FSM task, resource and service-processing capabilities, including scheduler resources, assigned work, technician task workflows and real-time synchronization. citeturn727719search0turn727719search2 McCormack Workshop OS should become the **purpose-built operational experience**, while NetSuite continues to perform the work it is strongest at: durable records, transactions, inventory, billing and enterprise control. That combination avoids a high-risk ERP replacement while still allowing the workshop experience to be designed from first principles around mechanics and service operations.