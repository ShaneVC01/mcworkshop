/** Shared values for the booking screen. Kept apart from the components so fast refresh keeps working. */
/** The day and drop off time picked on the booking screen. */
export interface ChosenTime {
  day: string
  time: string
}

import type { BookingItem, BookingType, CatalogueItem, Id, RegoState, UpsellItem } from '@/types'


export interface VehicleDraft {
  registration: string
  state: RegoState
  make: string
  model: string
  year: string
  odometerKm: string
}

export const emptyVehicle: VehicleDraft = { registration: '', state: 'QLD', make: '', model: '', year: '', odometerKm: '' }
export const vehicleReady = (v: VehicleDraft) => Boolean(v.registration.trim() && v.make.trim() && v.model.trim())

export const UPSELL_LABEL: Record<UpsellItem['kind'], string> = {
  declined: 'Declined',
  'not-answered': 'No answer',
  'not-quoted': 'Found, not quoted',
  monitor: 'Keep an eye on',
}

export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  service: 'Service',
  'service-repair': 'Service and repairs',
  repair: 'Repair only',
}

// ---- Item lines (parts, labour and one off charges) -------------------------------------------

/** A line's identity: the item, and for fitting labour the part it fits. */
export const itemLineKey = (l: BookingItem) => `${l.itemId}@${l.forItemId ?? ''}`

/** What one press of Add puts on: an hour (or the set time) of labour, or one part or charge. */
export const addStep = (item: CatalogueItem) => (item.kind === 'labour' ? (item.standardHours ?? 1) : 1)

/** Steps for the plus and minus buttons: quarter hours for labour, small steps for short fitting jobs. */
export const qtyStep = (item: CatalogueItem, qty: number) => (item.kind !== 'labour' ? 1 : qty < 0.5 ? 0.05 : 0.25)

const round = (n: number) => Math.round(n * 100) / 100

/** Adds an item. A part brings its usual fitting labour with it. Adding again raises the quantity. */
export function addItemLine(lines: BookingItem[], item: CatalogueItem): BookingItem[] {
  const next = bump(lines, { itemId: item.id, qty: addStep(item) })
  return item.kind === 'part' && item.fitting ? bump(next, { itemId: item.fitting.itemId, qty: item.fitting.hours, forItemId: item.id }) : next
}

function bump(lines: BookingItem[], add: BookingItem) {
  const key = itemLineKey(add)
  return lines.some((l) => itemLineKey(l) === key)
    ? lines.map((l) => (itemLineKey(l) === key ? { ...l, qty: round(l.qty + add.qty) } : l))
    : [...lines, add]
}

/** Changes a quantity. Zero or less removes the line, and removing a part removes its fitting labour. */
export function setItemQty(lines: BookingItem[], line: BookingItem, qty: number): BookingItem[] {
  if (qty <= 0) return removeItemLine(lines, line)
  return lines.map((l) => (itemLineKey(l) === itemLineKey(line) ? { ...l, qty: round(qty) } : l))
}

export function removeItemLine(lines: BookingItem[], line: BookingItem): BookingItem[] {
  const key = itemLineKey(line)
  return lines.filter((l) => itemLineKey(l) !== key && !(line.forItemId === undefined && l.forItemId === line.itemId))
}

/** Fitting labour for a part that has no usual labour, using the general labour item. */
export function addFittingLine(lines: BookingItem[], partId: Id, labourId: Id, hours = 0.5): BookingItem[] {
  return bump(lines, { itemId: labourId, qty: hours, forItemId: partId })
}