/**
 * Capacity maths from the PRD.
 *   Available = shift - breaks - leave - training - other blocked time
 *   Free = Available - Booked
 *   Utilisation = Booked / Available
 * Technician availability and bay availability are separate constraints.
 */
import { addWorkingDays, at, dayKey, fromMinutes, isWorkingDay, minutesOfDay, nowIso, toMinutes } from '@/lib/format'
import type {
  AvailabilityRequest,
  AvailabilitySlot,
  Bay,
  Booking,
  CapacitySummary,
  DayCapacity,
  Id,
  Technician,
} from '@/types'

export const DAY_START = 7 * 60
export const DAY_END = 17 * 60
export const SNAP_MINUTES = 15

type Span = [number, number]

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
  const shift = toMinutes(tech.shiftEnd) - toMinutes(tech.shiftStart) - tech.breakMinutes
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
  const availableHours = sum((c) => c.availableHours)
  const confirmedHours = sum((c) => c.bookedHours)
  const tentativeHours = sum((c) => c.tentativeHours)
  return {
    day,
    availableHours,
    confirmedHours,
    tentativeHours,
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

/** Finds the next suitable openings: technician with the skill, contiguous time and a free bay. */
export function findSlots(
  request: AvailabilityRequest,
  technicians: Technician[],
  bays: Bay[],
  bookings: Booking[],
  limit = 4,
): AvailabilitySlot[] {
  const duration = Math.ceil((request.labourHours * 60) / SNAP_MINUTES) * SNAP_MINUTES
  const now = nowIso()
  const today = dayKey(now)
  const slots: AvailabilitySlot[] = []
  let day = isWorkingDay(request.fromDay) ? request.fromDay : addWorkingDays(request.fromDay, 1)

  for (let i = 0; i < 15 && slots.length < limit; i++, day = addWorkingDays(day, 1)) {
    if (day < today) continue
    const earliest = day === today ? Math.ceil((minutesOfDay(now) + 15) / 30) * 30 : 0
    const dayBookings = bookings.filter((b) => dayKey(b.startAt) === day)
    const found: AvailabilitySlot[] = []

    for (const tech of technicians) {
      if (!tech.active || unavailableAllDay(tech, day)) continue
      if (request.skill && !tech.skills.includes(request.skill)) continue
      const busy: Span[] = [
        ...blockedSpans(tech, day),
        ...dayBookings.filter((b) => b.technicianIds.includes(tech.id)).map(spanOf),
      ].sort((a, b) => a[0] - b[0])
      const shiftEnd = toMinutes(tech.shiftEnd)
      let cursor = Math.max(toMinutes(tech.shiftStart), earliest)
      for (const [a, b] of [...busy, [shiftEnd, shiftEnd] as Span]) {
        while (cursor + duration <= Math.min(a, shiftEnd)) {
          const span: Span = [cursor, cursor + duration]
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
    found.sort((a, b) => a.startAt.localeCompare(b.startAt))
    slots.push(...found.slice(0, Math.max(2, limit - slots.length - 1)))
  }
  return slots.slice(0, limit)
}
