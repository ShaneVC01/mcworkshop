/**
 * Capacity maths from the PRD.
 *   Available = shift - breaks - leave - training - other blocked time
 *   Free = Available - Booked
 *   Utilisation = Booked / Available
 * Technician availability and bay availability are separate constraints.
 */
import { addDays, addWorkingDays, at, dayKey, fromMinutes, isWorkingDay, minutesOfDay, nowIso, toMinutes } from '@/lib/format'
import type {
  AssignIssue,
  AvailabilityRequest,
  Bay,
  Booking,
  CapacitySummary,
  DayAvailability,
  DayCapacity,
  Id,
  Technician,
} from '@/types'

export const DAY_START = 7 * 60
export const DAY_END = 17 * 60
export const SNAP_MINUTES = 15

type Span = [number, number]

/** Workshop wide breaks (minutes of the day) and the gap kept between vehicles. Set from Admin through the data layer. */
let rules: { breaks: Span[]; gapMinutes: number } = { breaks: [], gapMinutes: 0 }

export function setWorkshopRules(breaks: { from: string; to: string }[], gapMinutes: number) {
  rules = { breaks: breaks.map((b) => [toMinutes(b.from), toMinutes(b.to)] as Span).sort((a, b) => a[0] - b[0]), gapMinutes }
}

export const workshopRules = () => rules

/** When work of this many minutes started at `start` finishes, carrying on after any break it runs into. */
export function finishAfterBreaks(start: number, minutes: number) {
  let end = start + minutes
  for (const [a, b] of rules.breaks) if (a < end && b > start) end += b - Math.max(a, start)
  return end
}

/** Work cannot start inside a break, so a start there moves to the end of it. */
export function startOutsideBreaks(start: number) {
  for (const [a, b] of rules.breaks) if (start >= a && start < b) return b
  return start
}

/** The ISO end of work that starts at `startAt`, with breaks added. */
export function endAtFor(startAt: string, hours: number) {
  return at(dayKey(startAt), fromMinutes(finishAfterBreaks(minutesOfDay(startAt), hours * 60)))
}

/** Minutes of break inside a span. Without workshop breaks, the mechanic's own break length is used. */
function breakWithin(tech: Technician, start: number, end: number) {
  if (!rules.breaks.length) return tech.breakMinutes
  return rules.breaks.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, end) - Math.max(a, start)), 0)
}

function blockedSpans(tech: Technician, day: string): Span[] {
  return tech.unavailable
    .filter((u) => u.day === day)
    .map((u) => [toMinutes(u.from ?? tech.shiftStart), toMinutes(u.to ?? tech.shiftEnd)] as Span)
}

export function unavailableAllDay(tech: Technician, day: string) {
  return tech.unavailable.find((u) => u.day === day && !u.from && !u.to)
}

export function availableMinutes(tech: Technician, day: string) {
  if (!tech.active || !isWorkingDay(day) || unavailableAllDay(tech, day)) return 0
  const shift = toMinutes(tech.shiftEnd) - toMinutes(tech.shiftStart) - breakWithin(tech, toMinutes(tech.shiftStart), toMinutes(tech.shiftEnd))
  const blocked = blockedSpans(tech, day).reduce((sum, [a, b]) => sum + (b - a), 0)
  return Math.max(0, shift - blocked)
}

export function technicianCapacity(tech: Technician, day: string, bookings: Booking[]): DayCapacity {
  const mine = bookings.filter((b) => b.technicianIds.includes(tech.id) && dayKey(b.startAt) === day)
  const share = (b: Booking) => b.estimatedLabourHours / Math.max(1, b.technicianIds.length)
  const bookedHours = mine.filter((b) => !b.tentative).reduce((s, b) => s + share(b), 0)
  const tentativeHours = mine.filter((b) => b.tentative).reduce((s, b) => s + share(b), 0)
  const availableHours = availableMinutes(tech, day) / 60
  return {
    day,
    technicianId: tech.id,
    availableHours,
    bookedHours,
    tentativeHours,
    freeHours: availableHours - bookedHours - tentativeHours,
    utilisation: availableHours ? bookedHours / availableHours : 0,
    unavailableReason: unavailableAllDay(tech, day)?.reason,
  }
}

export function dayCapacity(
  day: string,
  technicians: Technician[],
  bookings: Booking[],
  dailyTargetHours = 0,
): CapacitySummary {
  const byTechnician = technicians.filter((t) => t.active).map((t) => technicianCapacity(t, day, bookings))
  const sum = (pick: (c: DayCapacity) => number) => byTechnician.reduce((s, c) => s + pick(c), 0)
  // Bookings wait without a mechanic until the vehicle arrives, and still take up the workshop's hours.
  const waiting = bookings.filter((b) => !b.technicianIds.length && dayKey(b.startAt) === day)
  const waitingHours = (tentative: boolean) => waiting.filter((b) => b.tentative === tentative).reduce((s, b) => s + b.estimatedLabourHours, 0)
  const availableHours = sum((c) => c.availableHours)
  const confirmedHours = sum((c) => c.bookedHours) + waitingHours(false)
  const tentativeHours = sum((c) => c.tentativeHours) + waitingHours(true)
  return {
    day,
    availableHours,
    confirmedHours,
    tentativeHours,
    unassignedHours: waitingHours(false) + waitingHours(true),
    freeHours: availableHours - confirmedHours - tentativeHours,
    utilisation: availableHours ? confirmedHours / availableHours : 0,
    potentialUtilisation: availableHours ? (confirmedHours + tentativeHours) / availableHours : 0,
    // Only technicians who are working that day count towards the target.
    targetHours: byTechnician.filter((c) => c.availableHours > 0).length * dailyTargetHours,
    byTechnician,
  }
}

const overlaps = (a: Span, b: Span) => a[0] < b[1] && b[0] < a[1]
const spanOf = (b: Booking): Span => [minutesOfDay(b.startAt), minutesOfDay(b.endAt)]

export interface Conflict {
  kind: 'technician' | 'bay' | 'unavailable' | 'outside-shift'
  message: string
  /** Hard conflicts cannot be overridden. */
  hard: boolean
}

/** Checks a proposed placement against other bookings, leave and bays. */
export function findConflicts(
  proposal: { id?: Id; startAt: string; endAt: string; technicianIds: Id[]; bayId?: Id },
  technicians: Technician[],
  bays: Bay[],
  bookings: Booking[],
): Conflict[] {
  const day = dayKey(proposal.startAt)
  const span: Span = [minutesOfDay(proposal.startAt), minutesOfDay(proposal.endAt)]
  const others = bookings.filter((b) => b.id !== proposal.id && dayKey(b.startAt) === day)
  const out: Conflict[] = []

  for (const techId of proposal.technicianIds) {
    const tech = technicians.find((t) => t.id === techId)
    if (!tech) continue
    const first = tech.name.split(' ')[0]
    if (unavailableAllDay(tech, day) || blockedSpans(tech, day).some((s) => overlaps(s, span))) {
      out.push({ kind: 'unavailable', message: `${first} is not available at that time.`, hard: true })
      continue
    }
    if (span[0] < toMinutes(tech.shiftStart) || span[1] > toMinutes(tech.shiftEnd)) {
      out.push({ kind: 'outside-shift', message: `Runs outside ${first}'s shift.`, hard: false })
    }
    const clash = others.find((b) => b.technicianIds.includes(techId) && overlaps(spanOf(b), span))
    if (clash) {
      out.push({ kind: 'technician', message: `${first} is already booked on ${clash.serviceName} then.`, hard: false })
    }
  }

  if (proposal.bayId && proposal.technicianIds.length) {
    const clash = others.find((b) => b.bayId === proposal.bayId && b.technicianIds.length && overlaps(spanOf(b), span))
    if (clash) {
      const bay = bays.find((b) => b.id === proposal.bayId)
      out.push({ kind: 'bay', message: `${bay?.name ?? 'The bay'} is in use then.`, hard: false })
    }
  }
  return out
}

/** Picks a free bay of the right type for a time span, if there is one. */
export function freeBay(bays: Bay[], bookings: Booking[], day: string, span: Span, bayType?: Bay['type'], ignoreId?: Id) {
  const sameDay = bookings.filter((b) => b.id !== ignoreId && dayKey(b.startAt) === day && b.technicianIds.length)
  return bays
    .filter((b) => !bayType || b.type === bayType)
    .find((bay) => !sameDay.some((b) => b.bayId === bay.id && overlaps(spanOf(b), span)))
}

/**
 * Whether one day can take the work, on the whole workshop's hours rather than any one mechanic's.
 * Free = every working mechanic's hours (what is left of today, for today) less everything booked that day.
 * Work that needs a skill also needs at least one mechanic with it working that day.
 */
export function dayAvailability(
  request: AvailabilityRequest,
  day: string,
  technicians: Technician[],
  bookings: Booking[],
): DayAvailability {
  const today = dayKey(nowIso())
  const empty = { availableHours: 0, bookedHours: 0, freeHours: 0, dropOffTimes: [] }
  if (day < today) return { day, status: 'past', ...empty }
  if (!isWorkingDay(day)) return { day, status: 'closed', ...empty }
  if (request.notBefore && day < request.notBefore) return { day, status: 'parts', ...empty }
  const working = technicians.filter((t) => availableMinutes(t, day) > 0)
  if (!working.length) return { day, status: 'closed', ...empty }

  const from = earliestStartOn(day)
  // Today only counts the shift time still ahead, less the break while it is still to come.
  const left = (t: Technician) => {
    const start = Math.max(toMinutes(t.shiftStart), from)
    const end = toMinutes(t.shiftEnd)
    if (start >= end) return 0
    const blocked = blockedSpans(t, day).reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, end) - Math.max(a, start)), 0)
    const breakLeft = rules.breaks.length ? breakWithin(t, start, end) : start < (toMinutes(t.shiftStart) + end) / 2 ? t.breakMinutes : 0
    return Math.max(0, end - start - blocked - breakLeft)
  }
  const availableHours = working.reduce((sum, t) => sum + (day === today ? left(t) : availableMinutes(t, day)), 0) / 60
  // For today, only the part of each booking still ahead needs the time.
  const bookedHours = bookings
    .filter((b) => dayKey(b.startAt) === day)
    .reduce((sum, b) => {
      if (day !== today) return sum + b.estimatedLabourHours
      const [a, z] = [minutesOfDay(b.startAt), minutesOfDay(b.endAt)]
      return sum + b.estimatedLabourHours * Math.max(0, Math.min(1, (z - Math.max(a, from)) / Math.max(1, z - a)))
    }, 0)
  const freeHours = availableHours - bookedHours
  const skills = request.skills ?? (request.skill ? [request.skill] : [])
  const skilled = working.some((t) => skills.every((sk) => t.skills.includes(sk)))

  const open = Math.min(...working.map((t) => toMinutes(t.shiftStart)))
  const close = Math.max(...working.map((t) => toMinutes(t.shiftEnd)))
  const first = Math.ceil(Math.max(open, from) / 30) * 30
  // Drop offs from opening to noon, earlier when the work would not be done by close.
  const last = Math.min(12 * 60, close - Math.ceil(request.labourHours * 2) * 30)
  const dropOffTimes: string[] = []
  for (let m = first; m <= Math.max(first, last) && m < close; m += 30) dropOffTimes.push(fromMinutes(m))
  const fits = skilled && dropOffTimes.length > 0 && freeHours + 1e-6 >= request.labourHours
  return { day, status: fits ? 'open' : 'full', availableHours, bookedHours, freeHours, dropOffTimes }
}

/** The next days that can take the work, earliest first, so each day fills before the next. Looks three weeks ahead. */
export function findDays(request: AvailabilityRequest, technicians: Technician[], bookings: Booking[], limit = request.limit ?? 5): DayAvailability[] {
  const out: DayAvailability[] = []
  const start = request.notBefore && request.notBefore > request.fromDay ? request.notBefore : request.fromDay
  let day = isWorkingDay(start) ? start : addWorkingDays(start, 1)
  for (let i = 0; i < 15 && out.length < limit; i++, day = addWorkingDays(day, 1)) {
    const d = dayAvailability(request, day, technicians, bookings)
    if (d.status === 'open') out.push(d)
  }
  return out
}

/** Whether each day of a month can take the work: open, full, closed or already past. */
export function monthAvailability(request: AvailabilityRequest, month: string, technicians: Technician[], bookings: Booking[]): DayAvailability[] {
  const out: DayAvailability[] = []
  for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) out.push(dayAvailability(request, day, technicians, bookings))
  return out
}

/** Earliest start offered today: the next half hour, at least 15 minutes from now. Other days start at 0. */
function earliestStartOn(day: string) {
  const now = nowIso()
  return day === dayKey(now) ? Math.ceil((minutesOfDay(now) + 15) / 30) * 30 : 0
}

/**
 * One mechanic's next free time on a day for work of this length, used when assigning an arrived vehicle.
 * A clean slot has no issue. Otherwise it offers the first free time anyway and says what is wrong with it,
 * so the controller can decide (assigning over a warning needs the override permission).
 */
export function nextSlotFor(
  tech: Technician,
  day: string,
  labourHours: number,
  bayType: Bay['type'] | undefined,
  bays: Bay[],
  bookings: Booking[],
): { slot?: { startAt: string; endAt: string; bayId?: Id }; issue?: AssignIssue } {
  if (!tech.active || !isWorkingDay(day) || unavailableAllDay(tech, day)) return { issue: 'off' }
  const clean = openingsOnDay({ labourHours, bayType, fromDay: day, skills: [] }, day, [tech], bays, bookings)[0]
  if (clean) return { slot: { startAt: clean.startAt, endAt: clean.endAt, bayId: clean.bayId } }

  const duration = Math.ceil((labourHours * 60) / SNAP_MINUTES) * SNAP_MINUTES
  const shiftEnd = toMinutes(tech.shiftEnd)
  const busy: Span[] = [
    ...blockedSpans(tech, day),
    ...bookings.filter((b) => dayKey(b.startAt) === day && b.technicianIds.includes(tech.id)).map(spanOf),
  ].sort((a, b) => a[0] - b[0])
  // The first moment they are free: sorted by start, so one pass steps over back to back work.
  let cursor = Math.max(toMinutes(tech.shiftStart), earliestStartOn(day))
  for (const [a, b] of busy) if (a <= cursor && b + rules.gapMinutes > cursor) cursor = b + rules.gapMinutes
  cursor = startOutsideBreaks(cursor)
  if (cursor >= shiftEnd) return { issue: 'no-room' }
  const span: Span = [cursor, finishAfterBreaks(cursor, duration)]
  const fitsShift = span[1] <= shiftEnd && !busy.some((s) => overlaps(s, span))
  return {
    slot: { startAt: at(day, fromMinutes(span[0])), endAt: at(day, fromMinutes(span[1])), bayId: freeBay(bays, bookings, day, span, bayType)?.id },
    issue: fitsShift ? 'no-bay' : 'runs-over',
  }
}

/** One mechanic's opening, used when assigning an arrived vehicle. */
export interface OpeningSlot {
  technicianId: Id
  technicianName: string
  bayId?: Id
  startAt: string
  endAt: string
}

/** The earliest opening each suitable mechanic has on one day, earliest first. Used for assignment only. */
export function openingsOnDay(
  request: AvailabilityRequest,
  day: string,
  technicians: Technician[],
  bays: Bay[],
  bookings: Booking[],
): OpeningSlot[] {
  const duration = Math.ceil((request.labourHours * 60) / SNAP_MINUTES) * SNAP_MINUTES
  const now = nowIso()
  const today = dayKey(now)
  if (day < today || !isWorkingDay(day)) return []
  const skills = request.skills ?? (request.skill ? [request.skill] : [])
  const earliest = earliestStartOn(day)
  const dayBookings = bookings.filter((b) => dayKey(b.startAt) === day)
  const found: OpeningSlot[] = []

  for (const tech of technicians) {
    if (!tech.active || unavailableAllDay(tech, day)) continue
    if (!skills.every((s) => tech.skills.includes(s))) continue
    const gap = rules.gapMinutes
    const busy: Span[] = [
      ...blockedSpans(tech, day),
      ...dayBookings.filter((b) => b.technicianIds.includes(tech.id)).map(spanOf).map(([a, b]) => [a - gap, b + gap] as Span),
    ].sort((a, b) => a[0] - b[0])
    const shiftEnd = toMinutes(tech.shiftEnd)
    let cursor = Math.max(toMinutes(tech.shiftStart), earliest)
    for (const [a, b] of [...busy, [shiftEnd, shiftEnd] as Span]) {
      while (finishAfterBreaks((cursor = startOutsideBreaks(cursor)), duration) <= Math.min(a, shiftEnd)) {
        const span: Span = [cursor, finishAfterBreaks(cursor, duration)]
        const bay = freeBay(bays, bookings, day, span, request.bayType)
        if (bay) {
          found.push({
            technicianId: tech.id,
            technicianName: tech.name,
            bayId: bay.id,
            startAt: at(day, fromMinutes(span[0])),
            endAt: at(day, fromMinutes(span[1])),
          })
          break
        }
        cursor += 30
      }
      if (found.some((f) => f.technicianId === tech.id)) break
      cursor = Math.max(cursor, b)
    }
  }
  return found.sort((a, b) => a.startAt.localeCompare(b.startAt))
}
