/**
 * Our own domain model. No NetSuite terms here.
 * These hand written types will later be replaced or backed by generated Supabase types.
 */

export type Id = string

// ---- Sync -----------------------------------------------------------------

export type SyncStatus = 'synced' | 'pending' | 'failed'

export interface SyncState {
  status: SyncStatus
  lastSyncedAt?: string
  error?: string
}

/** Every data function returns its data together with a sync status. */
export interface Result<T> {
  data: T
  sync: SyncState
}

/** Servicing is phase 1. Custom builds come later and reuse the same model. */
export type Division = 'servicing' | 'custom-build'

// ---- People ---------------------------------------------------------------

export type Role = 'advisor' | 'controller' | 'mechanic' | 'manager' | 'admin'

export interface StaffUser {
  id: Id
  name: string
  role: Role
  /** Job title as staff know it, for example "Mechanical manager". */
  title?: string
  /** Inactive people cannot sign in and are not offered for new work. */
  active: boolean
  /** Set when the staff member is also a technician. */
  technicianId?: Id
}

/** Everything a role can be allowed to do. Labels and defaults are in src/auth/default-permissions.ts. */
export type Action =
  | 'calendar.view'
  | 'booking.create'
  | 'booking.move'
  | 'booking.override-conflict'
  | 'quote.manage'
  | 'job.work'
  | 'board.move'
  | 'job.assign'
  | 'parts.manage'
  | 'job.verify'
  | 'job.payment'
  | 'reports.view'
  | 'money.view'
  | 'admin.workshop'
  | 'admin.catalogue.view'
  | 'admin.catalogue.edit'
  | 'admin.users'
  | 'integration.view'

export type RolePermissions = Record<Role, Action[]>

export type Skill = 'servicing' | 'diagnostics' | 'suspension' | 'electrical' | 'brakes' | 'accessories'

export interface Unavailability {
  /** Day key, YYYY-MM-DD in Australia/Brisbane. */
  day: string
  reason: 'leave' | 'sick' | 'training'
  /** HH:mm. Omitted means the whole shift. */
  from?: string
  to?: string
}

export interface Technician {
  id: Id
  name: string
  skills: Skill[]
  /** HH:mm */
  shiftStart: string
  shiftEnd: string
  breakMinutes: number
  active: boolean
  unavailable: Unavailability[]
}

export type BayType = 'hoist' | 'flat' | 'alignment'

export interface Bay {
  id: Id
  name: string
  type: BayType
}

// ---- Customers and vehicles -------------------------------------------------

export interface Customer {
  id: Id
  name: string
  mobile: string
  email?: string
  /** Street address, one line. */
  address?: string
  postcode?: string
  sync: SyncState
}

export type RegoState = 'QLD' | 'NSW' | 'VIC' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT'

export interface Vehicle {
  id: Id
  registration: string
  registrationState: RegoState
  vin?: string
  make: string
  model: string
  year?: number
  odometerKm?: number
  customerId: Id
  sync: SyncState
}

// ---- Workshop settings ------------------------------------------------------

export interface ClosedDay {
  /** Day key, YYYY-MM-DD in Australia/Brisbane. */
  day: string
  reason: string
}

export interface WorkshopSettings {
  /** Default workshop hours, HH:mm. New technicians start with these. */
  openTime: string
  closeTime: string
  /** Total of the breaks below, in minutes. Kept for the per mechanic shift hours. */
  breakMinutes: number
  /** Breaks for the whole workshop, HH:mm. No work starts inside one; work that runs into one carries on after it. */
  breaks: { from: string; to: string }[]
  /** Least time between one vehicle finishing and the next starting for the same mechanic, in minutes. */
  gapMinutes: number
  /** Billable hours each technician should book per day. The workshop target adds these up. */
  dailyTargetHours: number
  /** Labour rate per hour, integer cents excluding GST. */
  labourRateCents: number
  closedDays: ClosedDay[]
}

// ---- Vehicle library --------------------------------------------------------

export type VehicleClass = '4wd' | 'passenger' | 'light-commercial'
export type FuelType = 'diesel' | 'petrol' | 'hybrid' | 'electric'

/** One make and model the workshop services. Will be read from the back office system later. */
export interface VehicleModel {
  id: Id
  make: string
  model: string
  /** For example "79 Series". */
  series?: string
  yearFrom: number
  /** Omitted means still in production. */
  yearTo?: number
  vehicleClass: VehicleClass
  fuel: FuelType
  engine?: string
  active: boolean
}

// ---- Service templates ------------------------------------------------------

export type ServiceCategory =
  | 'Scheduled service'
  | 'Repair'
  | 'Inspection'
  | 'Accessory fitment'
  | 'Suspension'
  | 'Electrical'
  | 'Diagnostic'
  | 'Other'

export interface ChecklistTemplateItem {
  label: string
  kind: 'check' | 'reading'
  unit?: string
  required: boolean
}

export interface TemplatePart {
  name: string
  qty: number
  unitCents: number
}

/**
 * A generic service, used when no vehicle profile exists. Scope it to a class of vehicle and a fuel
 * when the work differs, for example a 30,000 km service for a diesel 4WD.
 */
export interface ServiceTemplate {
  id: Id
  name: string
  category: ServiceCategory
  division: Division
  labourHours: number
  skill: Skill
  bayType: BayType
  parts: TemplatePart[]
  checklist: ChecklistTemplateItem[]
  /** Service interval for scheduled services. */
  intervalKm?: number
  vehicleClass?: VehicleClass
  fuel?: FuelType
  notes?: string
  /** Omitted means active. Inactive templates are not offered on new bookings. */
  active?: boolean
}

/** What a service needs on one make and model. Refines a generic template and wins over it. */
export interface ServiceProfile {
  id: Id
  /** The generic service this profile refines. */
  templateId: Id
  modelId: Id
  labourHours: number
  parts: TemplatePart[]
  /** Omitted means use the generic checklist. */
  checklist?: ChecklistTemplateItem[]
  notes?: string
  active: boolean
}

/** What a booking will actually use for one vehicle and one service. */
export interface ServicePlan {
  template: ServiceTemplate
  source: 'profile' | 'generic'
  profile?: ServiceProfile
  model?: VehicleModel
  labourRateCents: number
}

/** Hours really booked against finished jobs, so profiles can be checked against reality. */
export interface ServiceActual {
  samples: number
  averageHours: number
}

// ---- Bookings ---------------------------------------------------------------

export type Readiness = 'ready' | 'parts-risk' | 'unknown'

/**
 * What kind of visit this is. A service (with or without repairs) triggers service reminders in the back
 * office. A repair only job does not.
 */
export type BookingType = 'service' | 'service-repair' | 'repair'

export interface Booking {
  id: Id
  /** Human friendly number, for example B-1042. */
  number: string
  division: Division
  jobId: Id
  vehicleId: Id
  customerId: Id
  /** Empty means unassigned. */
  technicianIds: Id[]
  bayId?: Id
  startAt: string
  endAt: string
  estimatedLabourHours: number
  serviceTemplateId?: Id
  serviceName: string
  /** Omitted means a service, the default. */
  bookingType?: BookingType
  tentative: boolean
  readiness: Readiness
  /** When the booking reminder went to the customer. Sent by the back office, read only here. */
  reminderSentAt?: string
  /** When the customer said they are still coming, by reply or on the phone. */
  customerConfirmedAt?: string
  sync: SyncState
}

// ---- Job cards --------------------------------------------------------------

export type JobStatus =
  | 'BOOKED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'READY_FOR_WORK'
  | 'IN_PROGRESS'
  | 'WAITING_APPROVAL'
  | 'WAITING_PARTS'
  | 'BLOCKED'
  | 'TECH_COMPLETE'
  | 'QUALITY_CHECK'
  | 'READY_TO_INVOICE'
  | 'READY_FOR_CUSTOMER'
  | 'CLOSED'

export interface LabourLine {
  id: Id
  description: string
  hours: number
  rateCents: number
  source: 'template' | 'additional'
  findingId?: Id
  /** The labour item it was sold as, when picked from the items list. */
  itemId?: Id
  done: boolean
}

export interface PartsLine {
  id: Id
  name: string
  qty: number
  unitCents: number
  source: 'template' | 'additional' | 'technician'
  /** The item it came from, when picked from the items list. */
  itemId?: Id
  used: boolean
}

export interface ChecklistItem {
  id: Id
  label: string
  kind: 'check' | 'reading'
  unit?: string
  required: boolean
  result?: 'ok' | 'attention'
  reading?: number
  findingId?: Id
}

export type FindingSeverity = 'monitor' | 'recommended' | 'safety'

export type ApprovalStatus = 'not-required' | 'draft' | 'awaiting-customer' | 'approved' | 'declined'

export interface Finding {
  id: Id
  jobId: Id
  title: string
  severity: FindingSeverity
  description: string
  /** Data URLs in the prototype. Storage paths later. */
  photos: string[]
  suggestedAction?: string
  extraLabourHours?: number
  approvalStatus: ApprovalStatus
  createdAt: string
  createdBy: string
}

/** Additional work raised from a finding, priced by the advisor for the customer to approve. */
export interface QuoteLine {
  id: Id
  findingId?: Id
  description: string
  labourHours: number
  labourCents: number
  partsCents: number
  status: Exclude<ApprovalStatus, 'not-required'>
  sentAt?: string
  decidedAt?: string
}

export interface TimeEntry {
  id: Id
  technicianId: Id
  startedAt: string
  endedAt?: string
}

export interface JobNote {
  id: Id
  text: string
  author: string
  createdAt: string
}

export interface JobCard {
  id: Id
  /** Human friendly number, for example J-2042. */
  number: string
  division: Division
  bookingId: Id
  vehicleId: Id
  customerId: Id
  status: JobStatus
  /** Customer's own words. Kept separate from the technician's diagnosis. */
  customerConcern: string
  labour: LabourLine[]
  parts: PartsLine[]
  checklist: ChecklistItem[]
  findings: Finding[]
  quoteLines: QuoteLine[]
  timeEntries: TimeEntry[]
  notes: JobNote[]
  promisedAt: string
  partsEta?: string
  blockedReason?: string
  mechanicSummary?: string
  odometerKmOut?: number
  completedAt?: string
  completedBy?: string
  /** The workshop manager checked the job and released it for invoicing. */
  verifiedAt?: string
  verifiedBy?: string
  /** The invoice was raised in the back office. The vehicle can be collected. */
  invoicedAt?: string
  /** The customer paid. The job is finished. */
  paidAt?: string
  sync: SyncState
}

// ---- Money ------------------------------------------------------------------

/** All amounts in integer cents. */
export interface Totals {
  labourCents: number
  partsCents: number
  subtotalCents: number
  gstCents: number
  totalCents: number
}

export interface Quote {
  jobId: Id
  /** The booked work. */
  base: Totals
  additional: QuoteLine[]
  /** Booked work plus approved additional work. */
  approved: Totals
  /** Additional work still waiting on the customer. */
  awaitingCents: number
}

export interface InvoiceSummary {
  jobId: Id
  number?: string
  status: 'not-invoiced' | 'draft' | 'sent' | 'paid'
  totals: Totals
  issuedAt?: string
}

// ---- Activity ---------------------------------------------------------------

export type ActivityType =
  | 'parts.ordered'
  | 'parts.eta'
  | 'parts.received'
  | 'parts.wrong'
  | 'booking.created'
  | 'booking.customer-confirmed'
  | 'booking.rescheduled'
  | 'booking.cancelled'
  | 'technician.assigned'
  | 'vehicle.checked_in'
  | 'job.status_changed'
  | 'job.started'
  | 'job.paused'
  | 'job.resumed'
  | 'checklist.updated'
  | 'finding.created'
  | 'quote.sent'
  | 'quote.approved'
  | 'quote.declined'
  | 'parts.waiting'
  | 'parts.used'
  | 'note.added'
  | 'job.completed'

export interface ActivityEvent {
  id: Id
  jobId: Id
  type: ActivityType
  actorId: Id
  actorName: string
  occurredAt: string
  summary: string
  metadata: Record<string, unknown>
}

// ---- Views (shaped for screens) ----------------------------------------------

/** A booking joined with what a screen needs to draw it. */
export interface ScheduledJob {
  booking: Booking
  job: JobCard
  vehicle: Vehicle
  customer: Customer
  technicians: Technician[]
  bay?: Bay
  /** True when the job is past its promised time and not finished. */
  atRisk: boolean
}

/**
 * Why a mechanic has no clean slot today: off for the day, no time left, the work would run past
 * the end of their shift, or no bay of the right kind is free then.
 */
export type AssignIssue = 'off' | 'no-room' | 'runs-over' | 'no-bay'

/** One mechanic offered when the workshop controller assigns an arrived vehicle. */
export interface AssignOption {
  technician: Technician
  capacity: DayCapacity
  /** Their other work that day, for the timeline. */
  jobs: ScheduledJob[]
  /** Their next free time today that suits the work. Missing when they are off or full. */
  slot?: { startAt: string; endAt: string; bayId?: Id }
  issue?: AssignIssue
  /** Skills the work needs that this mechanic does not have. */
  missingSkills: Skill[]
  /** The mechanic pencilled in when the booking was made. */
  planned: boolean
}

export interface AssignPlan {
  job: ScheduledJob
  day: string
  /** Mechanics with a clean slot first, earliest first, then the rest. */
  options: AssignOption[]
}

export interface DayCapacity {
  day: string
  technicianId: Id
  availableHours: number
  bookedHours: number
  tentativeHours: number
  freeHours: number
  utilisation: number
  unavailableReason?: Unavailability['reason']
}

export interface CapacitySummary {
  day: string
  availableHours: number
  confirmedHours: number
  tentativeHours: number
  /** Booked hours with no mechanic yet, included in the confirmed and tentative hours. */
  unassignedHours: number
  freeHours: number
  utilisation: number
  potentialUtilisation: number
  /** Billable hours the workshop aims to book, from the daily target in Admin. */
  targetHours: number
  byTechnician: DayCapacity[]
}

export interface AvailabilityRequest {
  labourHours: number
  skill?: Skill
  /** Every skill the work needs. One mechanic must have them all. */
  skills?: Skill[]
  bayType?: BayType
  /** Day key to start searching from. */
  fromDay: string
  /** No day before this one: ordered parts are not in yet. */
  notBefore?: string
  /** How many days to return. Defaults to 5. */
  limit?: number
}

/**
 * Whether a day can take the work, judged on the whole workshop's hours. Bookings are not given a mechanic:
 * the workshop assigns one when the vehicle arrives, so a day is open while its free hours cover the work.
 */
export interface DayAvailability {
  day: string
  /** `parts` means the day is before the ordered parts can be in. */
  status: 'open' | 'full' | 'closed' | 'past' | 'parts'
  /** Hours every working mechanic has that day (what is left of today, for today). */
  availableHours: number
  /** Hours already booked that day, assigned or not, tentative included. */
  bookedHours: number
  freeHours: number
  /** Drop off times on offer, HH:mm, earliest first. The first one fills the day from opening. */
  dropOffTimes: string[]
}

// ---- Booking screen ------------------------------------------------------------

/** A customer found while starting a booking, with every vehicle they own. */
export interface BookingCandidate {
  customer: Customer
  vehicles: Vehicle[]
  /** What the search matched, so staff can tell similar customers apart. */
  matchedOn: 'rego' | 'name' | 'mobile' | 'email'
  matchedVehicleId?: Id
  lastVisit?: string
}

/** An existing customer who looks like the one being added. */
export interface DuplicateMatch {
  customer: Customer
  vehicles: Vehicle[]
  reasons: string[]
}

/** Work found or quoted on an earlier visit that the customer did not go ahead with. */
export interface UpsellItem {
  id: Id
  jobId: Id
  day: string
  description: string
  kind: 'declined' | 'not-answered' | 'not-quoted' | 'monitor'
  severity?: FindingSeverity
  labourHours: number
  labourCents: number
  partsCents: number
}

export interface BookingHistory {
  visits: TimelineVisit[]
  upsell: UpsellItem[]
}

/** A service offered on the booking screen for this vehicle. */
export interface ServiceSuggestion {
  templateId: Id
  /** What staff see, for example "150,000 km service". */
  label: string
  reason: string
  labourHours: number
}

/** Extra work added to a booking that is not a catalogue service, for example a declined quote. */
/** Parts are stocked or ordered items, labour is sold by the hour, charges are one off fees such as consumables. */
export type ItemKind = 'part' | 'labour' | 'charge'

/**
 * One entry in the items list: what can go on a job as a line. Synced from the back office item list.
 * Parts and labour are separate lines there too; `fitting` only suggests the labour that usually goes with a part.
 */
export interface CatalogueItem {
  id: Id
  /** Part number or item code as the back office knows it, for example DBA2716E or LAB4WD. */
  code: string
  name: string
  kind: ItemKind
  /** The back office item class, for example Brakes and rotors or Labour. */
  category: string
  /** Sell price excluding GST, in cents. For labour, per hour. */
  unitCents: number
  unit: 'each' | 'hour' | 'litre'
  /** Labour with a set time, for example 1 h for front brake pads. */
  standardHours?: number
  /** A skill the labour needs, so only a mechanic who has it is offered. */
  skill?: Skill
  /** Labour usually added when this part is fitted, and how long per part. */
  fitting?: { itemId: Id; hours: number }
  /** Parts only. False means it is ordered in for the job rather than kept on the shelf. */
  stocked?: boolean
  /** Working days from ordering to having it in the workshop, for parts that are ordered in. */
  leadTimeDays?: number
  active: boolean
}

/** An item line chosen at booking. For labour, `qty` is hours. `forItemId` marks fitting labour for a part. */
export interface BookingItem {
  itemId: Id
  qty: number
  forItemId?: Id
}

export interface BookingExtra {
  description: string
  labourHours: number
  partsCents: number
  /** The earlier quote or finding it came from. */
  sourceId?: Id
}

/**
 * A specialist part ordered in for one booking: not kept in stock, with a lead time.
 * Lifecycle: to order, ordered (with an ETA), received. A wrong part goes back to to order.
 * Normal service parts kept on the shelf never get one of these.
 */
export type PartOrderStatus = 'to-order' | 'ordered' | 'received'

export interface PartOrder {
  id: Id
  jobId: Id
  bookingId: Id
  itemId: Id
  code: string
  name: string
  qty: number
  leadTimeDays: number
  status: PartOrderStatus
  /** Last working day to order it so it is in by the booking. */
  orderBy: string
  /** The booking day. */
  neededBy: string
  supplier?: string
  orderedAt?: string
  /** Day the supplier says it arrives. */
  eta?: string
  receivedAt?: string
  /** Set when the wrong part came in and it has to be ordered again. */
  wrongPartAt?: string
  note?: string
  sync: SyncState
}

/** How a part order stands against its booking. */
export type PartRisk = 'order-now' | 'overdue' | 'late' | 'on-track' | 'no-eta' | 'received' | 'upcoming'

export interface PartOrderRow {
  order: PartOrder
  risk: PartRisk
  booking: Booking
  vehicle: Vehicle
  customer: Customer
}

export interface BookingEstimate {
  labourHours: number
  labourCents: number
  partsCents: number
  subtotalCents: number
  gstCents: number
  totalCents: number
  skills: Skill[]
  bayType: BayType
  /** Services priced from a vehicle profile rather than the generic template. */
  profileNames: string[]
  /** Parts ordered in for this work, slowest first. The booking cannot be earlier than the slowest arrives. */
  orderedParts: { name: string; code: string; leadTimeDays: number }[]
  /** First day the work can be booked, once the ordered parts are in. Absent when nothing is ordered in. */
  partsReadyDay?: string
}


export interface SearchHit {
  kind: 'vehicle' | 'customer' | 'booking'
  id: Id
  title: string
  subtitle: string
  vehicle?: Vehicle
  to: string
}

export interface VehicleDetail {
  vehicle: Vehicle
  customer: Customer
  lastVisit?: string
  nextBooking?: Booking
  currentJob?: JobCard
}

export interface TimelineVisit {
  job: JobCard
  booking: Booking
  serviceName: string
  day: string
}

export interface TodaySummary {
  day: string
  capacity: CapacitySummary
  counts: Record<'arriving' | 'inProgress' | 'approval' | 'parts' | 'blocked' | 'ready' | 'unassigned' | 'atRisk', number>
  needsAttention: ScheduledJob[]
  technicians: Technician[]
  idleTechnicians: Technician[]
}

export interface UtilisationReport {
  days: CapacitySummary[]
  technicians: { technician: Technician; availableHours: number; bookedHours: number; clockedHours: number; utilisation: number }[]
  completedOnTime: number
  completedLate: number
  averageApprovalWaitMinutes: number
}

// ---- Edge Functions -------------------------------------------------------------

/** Meta returned by every Edge Function. */
export interface EdgeMeta {
  correlationId: string
  durationMs: number
  netsuiteRequests: number
  [key: string]: unknown
}

/** A customer as returned by the customers-list Edge Function. */
export interface IntegrationCustomer {
  id: string
  number: string
  name: string
  kind: 'person' | 'company'
  email?: string
  phone?: string
  mobile?: string
  /** As formatted by the back office system, for example 11/11/2026. */
  createdAt?: string
}

// ---- Live vehicle library -----------------------------------------------------

/** One row of the synced vehicle library (vehicle-library-list function). */
export interface LibraryVehicle {
  id: string
  name: string
  /** The plain model when the name carries a trim, for example FORTUNER for FORTUNER GXL. */
  baseModel: string | null
  family: string | null
  series: string | null
  makeId: string
  makeName: string
  yearFrom: number | null
  yearTo: number | null
  vehicleClass: string | null
  classLabel: string | null
  fuel: string | null
  fuelLabel: string | null
  engine: string | null
  source: 'netsuite' | 'manual'
  active: boolean
  needsReview: boolean
  lastSyncedAt: string | null
  /** Customer vehicles on record for this model. */
  vehicleCount: number
  /** How many records the type and fuel were worked out from. */
  evidenceVehicles: number | null
  /** history: worked out from workshop records. research: checked against public sources. manual: set by staff. */
  attributesSource: 'history' | 'research' | 'manual' | null
  /** Research notes with confidence and source links. */
  notes: string | null
}

export interface LibraryFilters {
  search: string
  makeId: string
  modelId: string
  sort: 'name' | 'popular'
  /** A class code, or 'none' for vehicles with no type yet. Empty means any. */
  vehicleClass: string
  fuel: string
  status: 'active' | 'inactive' | 'all'
  source: '' | 'netsuite' | 'manual'
  page: number
  pageSize: number
}

export interface LibraryPage {
  items: LibraryVehicle[]
  total: number
  facets: {
    makes: { id: string; name: string; active: boolean; activeModels: number; models: number }[]
    /** The models of the chosen make. Empty until a make is chosen. */
    models: { id: string; name: string; vehicles: number }[]
    classes: { code: string; label: string }[]
    fuels: { code: string; label: string }[]
  }
  summary: {
    activeModels: number
    activeMakes: number
    needingReview: number
    lastSync: { at: string; fetched: number; inserted: number; updated: number; deactivated: number; skipped: number } | null
  }
}

export interface LibraryHistoryResult {
  dryRun: boolean
  modelsMatched: number
  classSet: number
  fuelSet: number
  yearsSet: number
}

export interface LibrarySyncResult {
  dryRun: boolean
  makes: { fetched: number; inserted: number; updated: number; deactivated: number }
  models: { fetched: number; inserted: number; updated: number; deactivated: number; skipped: number }
}

// ---- Integration diagnostics --------------------------------------------------

export interface SyncLogEntry {
  id: Id
  action: string
  label: string
  entityId: Id
  status: SyncStatus
  attempts: number
  createdAt: string
  updatedAt: string
  error?: string
  /** Phase 1 never sends anything. Later phases default to dry run. */
  mode: 'dry-run' | 'live'
  payload: Record<string, unknown>
}
