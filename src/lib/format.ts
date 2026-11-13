/**
 * Locale: Australian English, AUD with GST at 10 percent, DD/MM/YYYY, Australia/Brisbane.
 * Brisbane has no daylight saving, so the offset is always +10:00.
 */

export const TIME_ZONE = 'Australia/Brisbane'
const OFFSET = '+10:00'
export const GST_RATE = 0.1

// ---- Registration -----------------------------------------------------------

/** Formats a raw registration for display, for example "923XYZ" becomes "923 XYZ". */
export function formatRego(registration: string) {
  const raw = normaliseRego(registration)
  return raw.length === 6 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw
}

export function normaliseRego(registration: string) {
  return registration.replace(/[\s-]+/g, '').toUpperCase()
}

// ---- Money ------------------------------------------------------------------

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

export function formatMoney(cents: number) {
  return aud.format(cents / 100)
}

export function gstOf(exGstCents: number) {
  return Math.round(exGstCents * GST_RATE)
}

export function incGst(exGstCents: number) {
  return exGstCents + gstOf(exGstCents)
}

// ---- Dates and times ----------------------------------------------------------

const parts = new Intl.DateTimeFormat('en-AU', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
})

function partsOf(date: Date) {
  const out: Record<string, string> = {}
  for (const p of parts.formatToParts(date)) out[p.type] = p.value
  return out
}

/** Day key in Brisbane, YYYY-MM-DD. */
export function dayKey(value: string | Date = new Date()) {
  const p = partsOf(typeof value === 'string' ? new Date(value) : value)
  return `${p.year}-${p.month}-${p.day}`
}

/** Builds an ISO timestamp from a Brisbane day key and HH:mm. */
export function at(day: string, time: string) {
  return `${day}T${time}:00${OFFSET}`
}

/** HH:mm in Brisbane. */
export function timeOf(iso: string) {
  const p = partsOf(new Date(iso))
  return `${p.hour}:${p.minute}`
}

export function minutesOfDay(iso: string) {
  return toMinutes(timeOf(iso))
}

export function toMinutes(time: string) {
  const [h = '0', m = '0'] = time.split(':')
  return Number(h) * 60 + Number(m)
}

export function fromMinutes(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addMinutes(iso: string, minutes: number) {
  return at(dayKey(iso), fromMinutes(minutesOfDay(iso) + minutes))
}

export function addDays(day: string, days: number) {
  const d = new Date(`${day}T12:00:00${OFFSET}`)
  d.setUTCDate(d.getUTCDate() + days)
  return dayKey(d)
}

/** 1 is Monday, 7 is Sunday. */
export function weekdayOf(day: string) {
  const n = new Date(`${day}T12:00:00${OFFSET}`).getUTCDay()
  return n === 0 ? 7 : n
}

/** Days the workshop is closed on top of weekends. Set from Admin through the data layer. */
let closedDays = new Set<string>()

export function setClosedDays(days: string[]) {
  closedDays = new Set(days)
}

export function isWorkingDay(day: string) {
  return weekdayOf(day) <= 5 && !closedDays.has(day)
}

/** Moves by working days, skipping weekends. */
export function addWorkingDays(day: string, days: number) {
  let d = day
  const step = days < 0 ? -1 : 1
  let left = Math.abs(days)
  while (left > 0) {
    d = addDays(d, step)
    if (isWorkingDay(d)) left--
  }
  return d
}

/** Today if it is a working day, otherwise the next Monday. */
export function workingToday() {
  let d = dayKey()
  while (!isWorkingDay(d)) d = addDays(d, 1)
  return d
}

export function mondayOf(day: string) {
  return addDays(day, 1 - weekdayOf(day))
}

/** 09/11/2026 */
export function formatDate(value: string) {
  const day = value.length === 10 ? value : dayKey(value)
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

const longDay = new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' })
const shortDay = new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' })

/** Monday 9 November */
export function formatDayLong(day: string) {
  return longDay.format(new Date(`${day}T12:00:00${OFFSET}`))
}

/** Mon 9 Nov */
export function formatDayShort(day: string) {
  return shortDay.format(new Date(`${day}T12:00:00${OFFSET}`))
}

/** 3:30 pm */
export function formatTime(value: string) {
  const time = value.length === 5 ? value : timeOf(value)
  const mins = toMinutes(time)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** 09/11/2026, 3:30 pm */
export function formatDateTime(iso: string) {
  return `${formatDate(iso)}, ${formatTime(iso)}`
}

/** Today, Tomorrow, Yesterday or Mon 9 Nov */
export function formatDayRelative(day: string) {
  const today = dayKey()
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  if (day === addDays(today, -1)) return 'Yesterday'
  return formatDayShort(day)
}

// ---- Quantities ---------------------------------------------------------------

const whole = new Intl.NumberFormat('en-AU')

export function formatKm(km?: number) {
  return km == null ? 'Odometer not recorded' : `${whole.format(km)} km`
}

/** 3.5 h */
export function formatHours(hours: number) {
  return `${hours.toFixed(1)} h`
}

/** 3 h 30 min */
export function formatDuration(minutes: number) {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest} min`
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

export function formatPercent(ratio: number) {
  return `${Math.round(ratio * 100)}%`
}

export function minutesBetween(fromIso: string, toIso: string) {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000
}

export function nowIso() {
  const d = new Date()
  const p = partsOf(d)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${String(d.getUTCSeconds()).padStart(2, '0')}${OFFSET}`
}
