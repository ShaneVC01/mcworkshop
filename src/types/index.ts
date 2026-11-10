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
  /** Set when the staff member is also a technician. */
  technicianId?: Id
}

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
}

// ---- Bookings ---------------------------------------------------------------

export type Readiness = 'ready' | 'parts-risk' | 'unknown'

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
  tentative: boolean
  readiness: Readiness
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
  | 'READY_FOR_CUSTOMER'
  | 'CLOSED'

export interface LabourLine {
  id: Id
  description: string
  hours: number
  rateCents: number
  source: 'template' | 'additional'
  findingId?: Id
  done: boolean
}

export interface PartsLine {
  id: Id
  name: string
  qty: number
  unitCents: number
  source: 'template' | 'additional' | 'technician'
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
  | 'booking.created'
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
  freeHours: number
  utilisation: number
  potentialUtilisation: number
  byTechnician: DayCapacity[]
}

export interface AvailabilityRequest {
  labourHours: number
  skill?: Skill
  bayType?: BayType
  /** Day key to start searching from. */
  fromDay: string
}

export interface AvailabilitySlot {
  technicianId: Id
  technicianName: string
  bayId?: Id
  startAt: string
  endAt: string
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
