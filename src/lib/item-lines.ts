import { addWorkingDays, workingToday } from '@/lib/format'
/**
 * Item lines chosen at booking, priced from the items list. Pure functions, used by the data layer.
 * Labour lines count towards the job's hours (and so the mechanic's time). Parts and charges only add money.
 */
import type { BookingItem, CatalogueItem, PartOrder, PartRisk, Skill } from '@/types'

export interface PricedItemLine {
  line: BookingItem
  item: CatalogueItem
  cents: number
}

/** Parts on the booking that are ordered in, slowest first, and the first working day they can all be in. */
export function partsLeadTime(lines: BookingItem[], items: CatalogueItem[], fromDay = workingToday()) {
  const ordered = lines
    .map((l) => items.find((i) => i.id === l.itemId))
    .filter((i): i is CatalogueItem => Boolean(i && i.kind === 'part' && i.stocked === false && i.leadTimeDays))
    .map((i) => ({ name: i.name, code: i.code, leadTimeDays: i.leadTimeDays! }))
    .sort((a, b) => b.leadTimeDays - a.leadTimeDays)
  const days = ordered[0]?.leadTimeDays ?? 0
  return { orderedParts: ordered, partsReadyDay: days ? addWorkingDays(fromDay, days) : undefined }
}

/** Where a part order stands. Today is a day key. */
export function partRisk(order: PartOrder, today: string): PartRisk {
  if (order.status === 'received') return 'received'
  if (order.status === 'ordered') return !order.eta ? 'no-eta' : order.eta > order.neededBy ? 'late' : 'on-track'
  if (today > order.orderBy) return 'overdue'
  // Order now when the order by day is today or the next working day.
  return order.orderBy <= addWorkingDays(today, 1) ? 'order-now' : 'upcoming'
}

export function priceItemLines(lines: BookingItem[], items: CatalogueItem[]) {
  const priced: PricedItemLine[] = lines
    .map((line) => ({ line, item: items.find((i) => i.id === line.itemId) }))
    .filter((p): p is { line: BookingItem; item: CatalogueItem } => Boolean(p.item) && p.line.qty > 0)
    .map(({ line, item }) => ({ line, item, cents: Math.round(line.qty * item.unitCents) }))
  const labour = priced.filter((p) => p.item.kind === 'labour')
  return {
    priced,
    labourHours: labour.reduce((s, p) => s + p.line.qty, 0),
    labourCents: labour.reduce((s, p) => s + p.cents, 0),
    partsCents: priced.filter((p) => p.item.kind !== 'labour').reduce((s, p) => s + p.cents, 0),
    skills: [...new Set(labour.map((p) => p.item.skill).filter((s): s is Skill => Boolean(s)))],
  }
}

/** Words for search: code, name and class, so "db1482", "brake pads" and "rotors" all work. */
export function matchesItem(item: CatalogueItem, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const text = `${item.code} ${item.code.replace(/[\s-]/g, '')} ${item.name} ${item.category}`.toLowerCase()
  return words.length > 0 && words.every((w) => text.includes(w))
}
