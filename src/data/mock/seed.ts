/**
 * Demo data for a 4WD servicing workshop. Everything here is invented.
 * Prices are placeholders and service schedules are not manufacturer data.
 * Bookings are laid out around the current working day so the demo always looks live.
 */
import { defaultRolePermissions } from '@/auth/default-permissions'
import { addDays, addMinutes, addWorkingDays, at, nowIso, workingToday } from '@/lib/format'
import type {
  ActivityEvent,
  Bay,
  Booking,
  ChecklistTemplateItem,
  Customer,
  JobCard,
  JobStatus,
  RegoState,
  RolePermissions,
  ServiceProfile,
  ServiceTemplate,
  StaffUser,
  SyncLogEntry,
  Technician,
  Vehicle,
  VehicleModel,
  WorkshopSettings,
} from '@/types'

export const LABOUR_RATE_CENTS = 16500

export interface Database {
  version: number
  seededFor: string
  staff: StaffUser[]
  technicians: Technician[]
  bays: Bay[]
  templates: ServiceTemplate[]
  /** Vehicle library: the makes and models the workshop services. */
  library: VehicleModel[]
  /** Service profiles: what a service needs on one make and model. */
  profiles: ServiceProfile[]
  settings: WorkshopSettings
  rolePermissions: RolePermissions
  customers: Customer[]
  vehicles: Vehicle[]
  bookings: Booking[]
  jobs: JobCard[]
  activity: ActivityEvent[]
  outbox: SyncLogEntry[]
  counters: { booking: number; job: number; id: number }
}

export const DB_VERSION = 7

const synced = () => ({ status: 'synced' as const, lastSyncedAt: nowIso() })

const check = (label: string, required = true): ChecklistTemplateItem => ({ label, kind: 'check', required })
const reading = (label: string, unit: string): ChecklistTemplateItem => ({ label, kind: 'reading', unit, required: true })

const serviceChecklist: ChecklistTemplateItem[] = [
  check('Engine oil and filter'),
  check('Coolant level and condition'),
  check('Brake fluid'),
  check('Front brake pads'),
  check('Rear brake pads'),
  check('Steering and suspension'),
  check('Battery health'),
  check('Belts and hoses'),
  check('Air filter', false),
  check('Diff and transfer case oils'),
  reading('Tyre pressure front left', 'psi'),
  reading('Tyre pressure front right', 'psi'),
  reading('Tyre pressure rear left', 'psi'),
  reading('Tyre pressure rear right', 'psi'),
  check('Road test'),
]

const preTripChecklist: ChecklistTemplateItem[] = [
  check('Full vehicle safety inspection'),
  check('Battery and charging system'),
  check('Electrical system and lights'),
  check('Suspension and load check'),
  check('Tyre condition, including spare'),
  reading('Tyre pressure front', 'psi'),
  reading('Tyre pressure rear', 'psi'),
  check('Fluid levels and leaks'),
  check('Recovery points and touring gear', false),
]

const inspectChecklist = (labels: string[]) => [...labels.map((l) => check(l)), check('Road test')]

const templates: ServiceTemplate[] = [
  {
    id: 'svc-10k', name: '10,000 km service', category: 'Scheduled service', division: 'servicing', intervalKm: 10000,
    labourHours: 2, skill: 'servicing', bayType: 'hoist',
    parts: [{ name: 'Engine oil 5W-30, 9 L', qty: 1, unitCents: 11800 }, { name: 'Oil filter', qty: 1, unitCents: 3400 }],
    checklist: serviceChecklist,
  },
  {
    id: 'svc-40k', name: '40,000 km service', category: 'Scheduled service', division: 'servicing', intervalKm: 40000,
    labourHours: 3.5, skill: 'servicing', bayType: 'hoist',
    parts: [
      { name: 'Engine oil 5W-30, 9 L', qty: 1, unitCents: 11800 }, { name: 'Oil filter', qty: 1, unitCents: 3400 },
      { name: 'Air filter', qty: 1, unitCents: 5900 }, { name: 'Fuel filter', qty: 1, unitCents: 7200 },
      { name: 'Brake fluid, 1 L', qty: 1, unitCents: 2600 },
    ],
    checklist: serviceChecklist,
  },
  {
    id: 'svc-120k', name: '120,000 km major service', category: 'Scheduled service', division: 'servicing', intervalKm: 120000,
    labourHours: 3.5, skill: 'servicing', bayType: 'hoist',
    parts: [
      { name: 'Engine oil 5W-30, 9 L', qty: 1, unitCents: 11800 }, { name: 'Oil filter', qty: 1, unitCents: 3400 },
      { name: 'Air filter', qty: 1, unitCents: 5900 }, { name: 'Fuel filter', qty: 1, unitCents: 7200 },
      { name: 'Diff and transfer oils', qty: 1, unitCents: 14500 }, { name: 'Coolant, 10 L', qty: 1, unitCents: 9800 },
    ],
    checklist: serviceChecklist,
  },
  // Generic starting points for vehicles that have no profile yet.
  {
    id: 'svc-30k-4wd', name: '30,000 km service, 4WD diesel', category: 'Scheduled service', division: 'servicing', intervalKm: 30000,
    vehicleClass: '4wd', fuel: 'diesel', notes: 'Generic starting point. Replace with a vehicle profile once the real times are known.',
    labourHours: 3, skill: 'servicing', bayType: 'hoist',
    parts: [
      { name: 'Engine oil 5W-30 diesel, 8 L', qty: 1, unitCents: 10400 }, { name: 'Oil filter', qty: 1, unitCents: 3400 },
      { name: 'Fuel filter', qty: 1, unitCents: 7200 }, { name: 'Air filter', qty: 1, unitCents: 5900 },
    ],
    checklist: serviceChecklist,
  },
  {
    id: 'svc-30k-pass', name: '30,000 km service, passenger petrol', category: 'Scheduled service', division: 'servicing', intervalKm: 30000,
    vehicleClass: 'passenger', fuel: 'petrol', notes: 'Generic starting point for cars and small SUVs.',
    labourHours: 2, skill: 'servicing', bayType: 'hoist',
    parts: [
      { name: 'Engine oil 5W-30, 5 L', qty: 1, unitCents: 7600 }, { name: 'Oil filter', qty: 1, unitCents: 2400 },
      { name: 'Air filter', qty: 1, unitCents: 4200 }, { name: 'Spark plugs', qty: 4, unitCents: 1800 },
    ],
    checklist: serviceChecklist,
  },
  {
    id: 'insp-susp', name: 'Suspension inspection', category: 'Suspension', division: 'servicing',
    labourHours: 1, skill: 'suspension', bayType: 'hoist', parts: [],
    checklist: inspectChecklist(['Shock absorbers', 'Springs and bushes', 'Ball joints and tie rods', 'Wheel bearings']),
  },
  {
    id: 'rep-brake', name: 'Front brake pad replacement', category: 'Repair', division: 'servicing',
    labourHours: 1.5, skill: 'brakes', bayType: 'hoist',
    parts: [{ name: 'Front brake pad set', qty: 1, unitCents: 18900 }],
    checklist: inspectChecklist(['Pads fitted and bedded', 'Rotor condition', 'Brake fluid level']),
  },
  {
    id: 'rep-bearing', name: 'Wheel bearing replacement', category: 'Repair', division: 'servicing',
    labourHours: 3, skill: 'suspension', bayType: 'hoist',
    parts: [{ name: 'Wheel bearing kit', qty: 1, unitCents: 26500 }],
    checklist: inspectChecklist(['Bearing fitted and torqued', 'Hub seal', 'ABS sensor']),
  },
  {
    id: 'acc-fit', name: 'Accessory fitment', category: 'Accessory fitment', division: 'servicing',
    labourHours: 4, skill: 'accessories', bayType: 'flat', parts: [],
    checklist: [check('Accessory fitted to instructions'), check('Wiring secured and fused'), check('Function test')],
  },
  {
    id: 'diag-elec', name: 'Electrical diagnosis', category: 'Electrical', division: 'servicing',
    labourHours: 2, skill: 'electrical', bayType: 'flat', parts: [],
    checklist: [check('Fault codes read'), check('Battery and charging test'), check('Fault confirmed')],
  },
  {
    id: 'insp-pretrip', name: 'Pre-trip inspection', category: 'Inspection', division: 'servicing',
    labourHours: 1.5, skill: 'servicing', bayType: 'hoist', parts: [], checklist: preTripChecklist,
  },
]

const staff: StaffUser[] = [
  { id: 'u-sean', name: 'Sean Poiani', role: 'advisor', title: 'Service advisor', active: true },
  { id: 'u-craig', name: 'Craig Hinckley', role: 'controller', title: 'Workshop controller', active: true },
  { id: 'u-brendan', name: 'Brendan Pallier', role: 'manager', title: 'Workshop manager', active: true },
  { id: 'u-harley', name: 'Harley Adams', role: 'manager', title: 'Workshop manager', active: true },
  { id: 'u-bodie', name: 'Bodie McCormack', role: 'admin', title: 'Owner', active: true },
  { id: 'u-rickie', name: 'Rickie McCormack', role: 'admin', title: 'Owner', active: true },
  { id: 'u-ali', name: 'Ali Baba Azizi', role: 'mechanic', title: 'Mechanic', active: true, technicianId: 't1' },
  { id: 'u-ben', name: 'Ben Wenger', role: 'mechanic', title: 'Mechanic', active: true, technicianId: 't5' },
  { id: 'u-brad', name: 'Brad Mulder', role: 'mechanic', title: 'Fitter', active: true, technicianId: 't9' },
  { id: 'u-brodie', name: 'Brodie Biddle', role: 'mechanic', title: 'Mechanic', active: true, technicianId: 't3' },
  { id: 'u-cheng', name: 'Cheng Yang', role: 'mechanic', title: 'Mechanic', active: true, technicianId: 't2' },
  { id: 'u-chris', name: 'Chris Scriven', role: 'mechanic', title: 'Mechanic', active: true, technicianId: 't4' },
  { id: 'u-cody', name: 'Cody Boreham', role: 'mechanic', title: 'Mechanic', active: true, technicianId: 't6' },
  { id: 'u-curtis', name: 'Curtis Williams', role: 'mechanic', title: 'Mechanic', active: true, technicianId: 't7' },
  { id: 'u-dale', name: 'Dale Coleman', role: 'mechanic', title: 'Mechanic', active: true, technicianId: 't8' },
]

// Invented demo entries, not manufacturer data. The real library will be read from the back office system.
const lib = (
  id: string, make: string, model: string, series: string | undefined, yearFrom: number, yearTo: number | undefined,
  vehicleClass: VehicleModel['vehicleClass'], fuel: VehicleModel['fuel'], engine?: string,
): VehicleModel => ({ id, make, model, series, yearFrom, yearTo, vehicleClass, fuel, engine, active: true })

const library: VehicleModel[] = [
  lib('m-lc79', 'Toyota', 'LandCruiser', '79 Series', 2007, undefined, '4wd', 'diesel', '4.5 L V8 turbo diesel'),
  lib('m-lc200', 'Toyota', 'LandCruiser', '200 Series', 2007, 2021, '4wd', 'diesel', '4.5 L V8 turbo diesel'),
  lib('m-lc300', 'Toyota', 'LandCruiser', '300 Series', 2021, undefined, '4wd', 'diesel', '3.3 L V6 twin turbo diesel'),
  lib('m-prado150', 'Toyota', 'Prado', '150 Series', 2009, 2023, '4wd', 'diesel', '2.8 L turbo diesel'),
  lib('m-hilux', 'Toyota', 'Hilux', undefined, 2015, undefined, 'light-commercial', 'diesel', '2.8 L turbo diesel'),
  lib('m-ranger', 'Ford', 'Ranger', undefined, 2011, undefined, 'light-commercial', 'diesel', '3.2 L five cylinder diesel'),
  lib('m-everest', 'Ford', 'Everest', undefined, 2015, undefined, '4wd', 'diesel', '2.0 L bi-turbo diesel'),
  lib('m-dmax', 'Isuzu', 'D-MAX', undefined, 2012, undefined, 'light-commercial', 'diesel', '3.0 L turbo diesel'),
  lib('m-mux', 'Isuzu', 'MU-X', undefined, 2013, undefined, '4wd', 'diesel', '3.0 L turbo diesel'),
  lib('m-patrol', 'Nissan', 'Patrol', undefined, 2013, undefined, '4wd', 'petrol', '5.6 L V8 petrol'),
  lib('m-navara', 'Nissan', 'Navara', undefined, 2015, undefined, 'light-commercial', 'diesel', '2.3 L twin turbo diesel'),
  lib('m-triton', 'Mitsubishi', 'Triton', undefined, 2015, undefined, 'light-commercial', 'diesel', '2.4 L turbo diesel'),
  lib('m-pajero-sport', 'Mitsubishi', 'Pajero Sport', undefined, 2015, undefined, '4wd', 'diesel', '2.4 L turbo diesel'),
  lib('m-bt50', 'Mazda', 'BT-50', undefined, 2011, undefined, 'light-commercial', 'diesel', '3.0 L turbo diesel'),
  lib('m-amarok', 'Volkswagen', 'Amarok', undefined, 2011, undefined, 'light-commercial', 'diesel', '3.0 L V6 turbo diesel'),
  lib('m-ram', 'RAM', '1500', undefined, 2019, undefined, 'light-commercial', 'petrol', '5.7 L V8 petrol'),
  lib('m-mazda3', 'Mazda', 'Mazda3', undefined, 2014, undefined, 'passenger', 'petrol', '2.0 L petrol'),
  lib('m-corolla', 'Toyota', 'Corolla', undefined, 2012, undefined, 'passenger', 'petrol', '2.0 L petrol'),
]

const profiles: ServiceProfile[] = [
  {
    id: 'p-lc79-40k', templateId: 'svc-40k', modelId: 'm-lc79', labourHours: 3,
    parts: [
      { name: 'Engine oil 15W-40 diesel, 11 L', qty: 1, unitCents: 14900 }, { name: 'Oil filter', qty: 1, unitCents: 3900 },
      { name: 'Fuel filter', qty: 1, unitCents: 8900 }, { name: 'Air filter', qty: 1, unitCents: 6400 },
    ],
    notes: 'Two fuel filters on the dual tank models. Check the snorkel before the air filter.', active: true,
  },
  {
    id: 'p-hilux-10k', templateId: 'svc-10k', modelId: 'm-hilux', labourHours: 1.5,
    parts: [{ name: 'Engine oil 5W-30 diesel, 7 L', qty: 1, unitCents: 9800 }, { name: 'Oil filter', qty: 1, unitCents: 3100 }],
    active: true,
  },
  {
    id: 'p-ranger-40k', templateId: 'svc-40k', modelId: 'm-ranger', labourHours: 3.5,
    parts: [
      { name: 'Engine oil 5W-30 diesel, 8.5 L', qty: 1, unitCents: 11200 }, { name: 'Oil filter', qty: 1, unitCents: 3600 },
      { name: 'Fuel filter', qty: 1, unitCents: 7800 }, { name: 'Air filter', qty: 1, unitCents: 5200 },
    ],
    active: true,
  },
  {
    id: 'p-dmax-10k', templateId: 'svc-10k', modelId: 'm-dmax', labourHours: 1.5,
    parts: [{ name: 'Engine oil 5W-30 diesel, 7 L', qty: 1, unitCents: 9800 }, { name: 'Oil filter', qty: 1, unitCents: 2900 }],
    active: true,
  },
  {
    id: 'p-prado-120k', templateId: 'svc-120k', modelId: 'm-prado150', labourHours: 4,
    parts: [
      { name: 'Engine oil 5W-30 diesel, 7.5 L', qty: 1, unitCents: 10600 }, { name: 'Oil filter', qty: 1, unitCents: 3400 },
      { name: 'Air filter', qty: 1, unitCents: 5900 }, { name: 'Fuel filter', qty: 1, unitCents: 8200 },
      { name: 'Diff and transfer oils', qty: 1, unitCents: 14500 }, { name: 'Coolant, 10 L', qty: 1, unitCents: 9800 },
    ],
    notes: 'Also check the DPF health and the front diff breather.', active: true,
  },
]

function defaultSettings(): WorkshopSettings {
  return { openTime: '07:00', closeTime: '15:30', breakMinutes: 30, dailyTargetHours: 6, labourRateCents: LABOUR_RATE_CENTS, closedDays: [] }
}

const bays: Bay[] = [
  { id: 'bay1', name: 'Bay 1', type: 'hoist' },
  { id: 'bay2', name: 'Bay 2', type: 'hoist' },
  { id: 'bay3', name: 'Bay 3', type: 'hoist' },
  { id: 'bay4', name: 'Bay 4', type: 'flat' },
]

const customerRows: [string, string, string][] = [
  ['John Smith', '0412 555 014', '4017'], ['Sarah Mitchell', '0423 555 182', '4034'],
  ['Wayne Carter', '0438 555 207', '4018'], ['Priya Nair', '0401 555 366', '4012'],
  ['Tom Baxter', '0417 555 421', '4500'], ['Leanne Foster', '0429 555 573', '4017'],
  ['Marcus Lee', '0455 555 618', '4032'], ['Deb Sullivan', '0408 555 764', '4020'],
  ['Northside Plumbing', '0733 555 812', '4034'], ['Greg Hollis', '0419 555 905', '4503'],
  ['Emma Tran', '0431 555 127', '4051'], ['Bayside Electrical', '0738 555 244', '4017'],
  ['Rob Jennings', '0447 555 398', '4014'], ['Cathy Walsh', '0402 555 456', '4036'],
  ['Steve Morrow', '0428 555 539', '4019'], ['Hannah Briggs', '0416 555 671', '4053'],
]

// registration, state, make, model, year, odometer km, customer index
const vehicleRows: [string, RegoState, string, string, number, number, number][] = [
  ['923XYZ', 'QLD', 'Toyota', 'LandCruiser 79', 2021, 142834, 0],
  ['117ABC', 'QLD', 'Toyota', 'Hilux SR5', 2019, 98210, 1],
  ['762JKL', 'QLD', 'Isuzu', 'D-MAX LS-U', 2022, 61400, 2],
  ['881GHT', 'QLD', 'Toyota', 'Prado GXL', 2018, 156900, 3],
  ['772KLM', 'QLD', 'Ford', 'Ranger Wildtrak', 2020, 88750, 4],
  ['818ABC', 'QLD', 'Isuzu', 'D-MAX SX', 2023, 39800, 5],
  ['304PQR', 'QLD', 'Nissan', 'Patrol Ti', 2017, 171300, 6],
  ['659DFG', 'QLD', 'Toyota', 'LandCruiser 200', 2016, 119600, 7],
  ['240WXC', 'QLD', 'Mitsubishi', 'Triton GLS', 2021, 72100, 8],
  ['593NBV', 'QLD', 'Ford', 'Ranger XLT', 2019, 133450, 8],
  ['406HJK', 'QLD', 'Toyota', 'Hilux Rugged X', 2022, 40150, 9],
  ['135TYU', 'QLD', 'Nissan', 'Navara ST-X', 2020, 94300, 10],
  ['978MNB', 'QLD', 'Mazda', 'BT-50 GT', 2021, 68900, 11],
  ['521ZXC', 'QLD', 'Toyota', 'Prado Kakadu', 2019, 121700, 12],
  ['860QWE', 'QLD', 'Volkswagen', 'Amarok V6', 2020, 79500, 13],
  ['347RTY', 'QLD', 'Isuzu', 'MU-X LS-T', 2022, 52300, 14],
  ['214FGH', 'QLD', 'Ford', 'Everest Trend', 2021, 64800, 15],
  ['695VBN', 'QLD', 'Toyota', 'Prado GX', 2015, 201400, 2],
  ['483LKJ', 'QLD', 'Nissan', 'Patrol Ti-L', 2019, 108900, 4],
  ['EKL42B', 'NSW', 'Mitsubishi', 'Pajero Sport', 2020, 87200, 6],
  ['126CVB', 'QLD', 'RAM', '1500 Laramie', 2022, 45600, 9],
  ['739SDF', 'QLD', 'Toyota', 'LandCruiser 79', 2018, 164200, 11],
  ['1TR9QZ', 'VIC', 'Ford', 'Ranger Raptor', 2023, 28400, 13],
  ['552GHJ', 'QLD', 'Mitsubishi', 'Triton GLX', 2017, 148300, 15],
]

interface Row {
  day: number
  tech: number // index into technicians, -1 for unassigned
  start: string
  template: string
  vehicle: number
  status?: JobStatus
  tentative?: boolean
  concern?: string
}

const rows: Row[] = [
  // previous working day, all closed
  { day: -1, tech: 0, start: '07:00', template: 'svc-40k', vehicle: 1 },
  { day: -1, tech: 1, start: '07:30', template: 'diag-elec', vehicle: 2, concern: 'Dash lights flicker when the fridge is running.' },
  { day: -1, tech: 2, start: '08:00', template: 'rep-bearing', vehicle: 3 },
  { day: -1, tech: 3, start: '07:00', template: 'acc-fit', vehicle: 4, concern: 'Fit customer supplied light bar and UHF.' },
  { day: -1, tech: 4, start: '09:00', template: 'svc-10k', vehicle: 5 },
  { day: -1, tech: 5, start: '07:30', template: 'insp-pretrip', vehicle: 6, concern: 'Heading to Cape York in two weeks.' },
  // today
  { day: 0, tech: 0, start: '07:00', template: 'svc-120k', vehicle: 7, status: 'IN_PROGRESS' },
  { day: 0, tech: 0, start: '11:30', template: 'rep-brake', vehicle: 8, status: 'CHECKED_IN' },
  { day: 0, tech: 1, start: '07:30', template: 'diag-elec', vehicle: 9, status: 'WAITING_APPROVAL', concern: 'Battery light comes on at idle with the headlights on.' },
  { day: 0, tech: 1, start: '10:30', template: 'svc-10k', vehicle: 10, status: 'CONFIRMED' },
  { day: 0, tech: 2, start: '07:00', template: 'rep-bearing', vehicle: 11, status: 'WAITING_PARTS', concern: 'Humming from the rear that gets louder with speed.' },
  { day: 0, tech: 2, start: '11:00', template: 'insp-susp', vehicle: 12, status: 'CHECKED_IN', concern: 'Knocking from left front when turning slowly.' },
  { day: 0, tech: 3, start: '07:00', template: 'svc-40k', vehicle: 13, status: 'TECH_COMPLETE' },
  { day: 0, tech: 3, start: '11:30', template: 'insp-pretrip', vehicle: 14, status: 'CONFIRMED', concern: 'Towing a van to Birdsville next month.' },
  { day: 0, tech: 5, start: '08:00', template: 'svc-10k', vehicle: 15, status: 'BLOCKED' },
  { day: 0, tech: 5, start: '13:00', template: 'insp-susp', vehicle: 16, status: 'BOOKED', tentative: true },
  { day: 0, tech: -1, start: '09:00', template: 'insp-pretrip', vehicle: 17, status: 'CONFIRMED' },
  { day: 0, tech: -1, start: '13:00', template: 'diag-elec', vehicle: 18, status: 'CONFIRMED', concern: 'Whining noise under the dash on cold start.' },
  // next working day
  { day: 1, tech: 0, start: '07:00', template: 'svc-10k', vehicle: 19 },
  { day: 1, tech: 0, start: '10:00', template: 'rep-brake', vehicle: 20 },
  { day: 1, tech: 1, start: '07:30', template: 'acc-fit', vehicle: 21, concern: 'Fit dual battery system.' },
  { day: 1, tech: 3, start: '08:00', template: 'svc-40k', vehicle: 22 },
  { day: 1, tech: 4, start: '07:00', template: 'insp-pretrip', vehicle: 23 },
  { day: 1, tech: 2, start: '09:00', template: 'insp-susp', vehicle: 2 },
  // an over capacity day, with one technician on leave
  { day: 2, tech: 0, start: '07:00', template: 'svc-120k', vehicle: 3 },
  { day: 2, tech: 0, start: '10:30', template: 'rep-bearing', vehicle: 4 },
  { day: 2, tech: 0, start: '13:30', template: 'rep-brake', vehicle: 5 },
  { day: 2, tech: 1, start: '07:00', template: 'svc-40k', vehicle: 6 },
  { day: 2, tech: 1, start: '11:00', template: 'diag-elec', vehicle: 1 },
  { day: 2, tech: 2, start: '07:00', template: 'acc-fit', vehicle: 8, concern: 'Fit bull bar and winch.' },
  { day: 2, tech: 2, start: '11:00', template: 'svc-40k', vehicle: 10 },
  { day: 2, tech: 2, start: '14:30', template: 'insp-susp', vehicle: 12 },
  { day: 2, tech: 3, start: '07:00', template: 'svc-40k', vehicle: 14 },
  { day: 2, tech: 3, start: '10:30', template: 'svc-120k', vehicle: 16 },
  { day: 2, tech: 3, start: '14:00', template: 'insp-pretrip', vehicle: 18 },
  { day: 2, tech: 4, start: '07:00', template: 'rep-bearing', vehicle: 20 },
  { day: 2, tech: 4, start: '10:30', template: 'svc-40k', vehicle: 22 },
  { day: 2, tech: -1, start: '08:00', template: 'svc-10k', vehicle: 9 },
  // later in the week
  { day: 3, tech: 0, start: '08:00', template: 'svc-10k', vehicle: 11 },
  { day: 3, tech: 1, start: '07:00', template: 'svc-40k', vehicle: 13, tentative: true },
  { day: 3, tech: 2, start: '07:30', template: 'insp-pretrip', vehicle: 15 },
  { day: 3, tech: 3, start: '09:00', template: 'diag-elec', vehicle: 17 },
]

export function buildJobParts(
  template: Pick<ServiceTemplate, 'name' | 'labourHours' | 'parts' | 'checklist'>,
  nextId: () => string,
  rateCents = LABOUR_RATE_CENTS,
) {
  return {
    labour: [
      { id: nextId(), description: template.name, hours: template.labourHours, rateCents, source: 'template' as const, done: false },
    ],
    parts: template.parts.map((p) => ({ id: nextId(), ...p, source: 'template' as const, used: false })),
    checklist: template.checklist.map((c) => ({ id: nextId(), ...c })),
  }
}

export function createSeed(): Database {
  const today = workingToday()
  const now = nowIso()
  let n = 0
  const nextId = () => `s${++n}`
  const dayFor = (offset: number) => (offset === 0 ? today : addWorkingDays(today, offset))

  const technicians: Technician[] = [
    { id: 't1', name: 'Ali Baba Azizi', skills: ['servicing', 'brakes', 'suspension'] },
    { id: 't2', name: 'Cheng Yang', skills: ['diagnostics', 'electrical', 'servicing', 'accessories'] },
    { id: 't3', name: 'Brodie Biddle', skills: ['suspension', 'brakes', 'servicing', 'accessories'] },
    { id: 't4', name: 'Chris Scriven', skills: ['servicing', 'accessories', 'electrical'] },
    { id: 't5', name: 'Ben Wenger', skills: ['servicing', 'brakes', 'suspension'] },
    { id: 't6', name: 'Cody Boreham', skills: ['diagnostics', 'servicing', 'suspension', 'electrical'] },
    { id: 't7', name: 'Curtis Williams', skills: ['servicing', 'brakes', 'electrical'] },
    { id: 't8', name: 'Dale Coleman', skills: ['servicing', 'diagnostics', 'suspension'] },
    // Brad is a fitter: accessories and fit outs rather than servicing.
    { id: 't9', name: 'Brad Mulder', skills: ['accessories', 'electrical', 'suspension'] },
  ].map((t) => ({ ...t, shiftStart: '07:00', shiftEnd: '15:30', breakMinutes: 30, active: true, unavailable: [] }) as Technician)

  technicians[4]!.unavailable.push({ day: today, reason: 'sick' })
  technicians[5]!.unavailable.push(
    { day: dayFor(1), reason: 'training', from: '13:00', to: '15:30' },
    { day: dayFor(2), reason: 'leave' },
    { day: dayFor(3), reason: 'leave' },
  )

  const customers: Customer[] = customerRows.map(([name, mobile, postcode], i) => ({
    id: `c${i + 1}`, name, mobile, postcode,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com.au`,
    sync: synced(),
  }))

  const vehicles: Vehicle[] = vehicleRows.map(([registration, registrationState, make, model, year, odometerKm, c], i) => ({
    id: `v${i + 1}`, registration, registrationState, make, model, year, odometerKm,
    vin: `JTM${String(1000000 + i * 7919).padStart(7, '0')}${String(100000 + i * 331)}`.slice(0, 17),
    customerId: customers[c]!.id, sync: synced(),
  }))

  const bookings: Booking[] = []
  const jobs: JobCard[] = []
  const activity: ActivityEvent[] = []
  let number = 1040
  const hoists = ['bay1', 'bay2', 'bay3']

  const add = (row: Row, dayOverride?: string) => {
    const template = templates.find((t) => t.id === row.template)!
    const vehicle = vehicles[row.vehicle]!
    const day = dayOverride ?? dayFor(row.day)
    const startAt = at(day, row.start)
    const endAt = addMinutes(startAt, template.labourHours * 60)
    const status: JobStatus = row.status ?? (row.day < 0 ? 'CLOSED' : row.tentative ? 'BOOKED' : 'CONFIRMED')
    number++
    const id = `${number}`
    const tech = row.tech >= 0 ? technicians[row.tech]! : undefined
    const built = buildJobParts(template, nextId)
    const done = ['TECH_COMPLETE', 'QUALITY_CHECK', 'READY_FOR_CUSTOMER', 'CLOSED'].includes(status)
    const started = done || ['IN_PROGRESS', 'WAITING_APPROVAL', 'WAITING_PARTS', 'BLOCKED'].includes(status)

    const job: JobCard = {
      id: `j${id}`, number: `J-${id}`, division: 'servicing', bookingId: `b${id}`,
      vehicleId: vehicle.id, customerId: vehicle.customerId, status,
      customerConcern: row.concern ?? `${template.name} as booked.`,
      ...built, findings: [], quoteLines: [], timeEntries: [], notes: [],
      promisedAt: addMinutes(endAt, 60), sync: synced(),
    }

    if (done) {
      job.checklist.forEach((c) => (c.kind === 'reading' ? (c.reading = 38) : (c.result = 'ok')))
      job.labour.forEach((l) => (l.done = true))
      job.parts.forEach((p) => (p.used = true))
      job.timeEntries.push({ id: nextId(), technicianId: tech?.id ?? 't1', startedAt: addMinutes(startAt, 8), endedAt: addMinutes(endAt, -12) })
      job.completedAt = addMinutes(endAt, -12)
      job.completedBy = tech?.name
      job.mechanicSummary = 'Work completed as booked. Road tested, no further concerns.'
      job.odometerKmOut = (vehicle.odometerKm ?? 0) + 12
    } else if (started) {
      const upTo = status === 'IN_PROGRESS' ? 9 : 3
      job.checklist.slice(0, upTo).forEach((c) => (c.kind === 'reading' ? (c.reading = 38) : (c.result = 'ok')))
      const early = addMinutes(now, -78)
      const startedAt = row.day !== 0 || early < startAt ? addMinutes(startAt, 10) : early
      job.timeEntries.push(
        status === 'IN_PROGRESS'
          ? { id: nextId(), technicianId: tech!.id, startedAt }
          : { id: nextId(), technicianId: tech!.id, startedAt, endedAt: addMinutes(startedAt, 40) },
      )
    }

    if (status === 'WAITING_APPROVAL') {
      const findingId = nextId()
      job.findings.push({
        id: findingId, jobId: job.id, title: 'Alternator output low', severity: 'recommended',
        description: 'Charging at 12.9 V under load. Alternator is failing and will not keep up with the fridge.',
        photos: [], suggestedAction: 'Replace alternator', extraLabourHours: 1.5,
        approvalStatus: 'awaiting-customer', createdAt: addMinutes(now, -41), createdBy: tech!.name,
      })
      job.quoteLines.push({
        id: nextId(), findingId, description: 'Replace alternator', labourHours: 1.5,
        labourCents: 1.5 * LABOUR_RATE_CENTS, partsCents: 64500, status: 'awaiting-customer', sentAt: addMinutes(now, -22),
      })
    }
    if (status === 'WAITING_PARTS') job.partsEta = at(day, '14:00')
    if (status === 'BLOCKED') job.blockedReason = 'Sump plug thread is stripped. Needs a decision before going further.'

    const booking: Booking = {
      id: `b${id}`, number: `B-${id}`, division: 'servicing', jobId: job.id,
      vehicleId: vehicle.id, customerId: vehicle.customerId,
      technicianIds: tech ? [tech.id] : [],
      bayId: tech ? (template.bayType === 'flat' ? 'bay4' : hoists[row.tech % 3]) : undefined,
      startAt, endAt, estimatedLabourHours: template.labourHours,
      serviceTemplateId: template.id, serviceName: template.name,
      tentative: Boolean(row.tentative),
      readiness: status === 'WAITING_PARTS' ? 'parts-risk' : template.parts.length ? 'ready' : 'unknown',
      sync: synced(),
    }

    bookings.push(booking)
    jobs.push(job)
    activity.push({
      id: nextId(), jobId: job.id, type: 'booking.created', actorId: 'u-sean', actorName: 'Sean Poiani',
      occurredAt: addMinutes(at(addDays(day, -6), '10:15'), number % 90),
      summary: `Booked ${template.name} for ${booking.number}`, metadata: {},
    })
    return job
  }

  rows.forEach((r) => add(r))

  // Service history for the demo vehicle, 923 XYZ.
  const history = add({ day: -1, tech: 0, start: '08:00', template: 'insp-susp', vehicle: 0 }, addDays(today, -85))
  history.findings.push({
    id: nextId(), jobId: history.id, title: 'Front brake pads at 40 percent', severity: 'monitor',
    description: 'Front pads have about 5 mm left. Check again at the next service.', photos: [],
    approvalStatus: 'not-required', createdAt: history.completedAt!, createdBy: technicians[0]!.name,
  })
  add({ day: -1, tech: 3, start: '07:30', template: 'svc-40k', vehicle: 0 }, addDays(today, -279))

  return {
    version: DB_VERSION, seededFor: today, staff, technicians, bays, templates, library, profiles,
    settings: defaultSettings(), rolePermissions: defaultRolePermissions(), customers, vehicles,
    bookings, jobs, activity, outbox: [], counters: { booking: number, job: number, id: 0 },
  }
}
