/**
 * Mock engine. Stands in for Supabase (tables, Realtime) and the NetSuite outbox.
 * Nothing in here talks to a network. Later phases replace the functions in src/data
 * with Supabase queries and keep the same signatures.
 */
import { getSession } from '@/auth/session'
import { nowIso, setClosedDays } from '@/lib/format'
import type { ActivityType, Id, Result, SyncLogEntry, SyncState } from '@/types'
import { createSeed, DB_VERSION, type Database } from './seed'

const DB_KEY = 'mcw-db'
const SETTINGS_KEY = 'mcw-settings'

export interface MockSettings {
  /** Occasionally fail reads and outbox sends, to exercise error and retry states. */
  simulateErrors: boolean
  /** Always "dry-run" in phase 1. Shown on the integration screen. */
  writeMode: 'dry-run'
}

export class DataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataError'
  }
}

let db: Database | undefined
const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('mcw')

/** Settings that plain functions in src/lib read, such as closed days. Runs on every load and commit. */
function applyRuntime(database: Database) {
  setClosedDays(database.settings.closedDays.map((d) => d.day))
  return database
}

function load(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      if (parsed.version === DB_VERSION) return applyRuntime(parsed)
    }
  } catch {
    // fall through to a fresh seed
  }
  return applyRuntime(createSeed())
}

function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // Storage full (photos). The session keeps working from memory.
  }
}

export function getDb(): Database {
  if (!db) {
    db = load()
    save()
    // Anything left mid flight by a reload is picked up again.
    db.outbox.filter((e) => e.status !== 'synced').forEach((e) => scheduleSend(e.id, 1500))
  }
  return db
}

function notify() {
  listeners.forEach((l) => l())
}

function commit() {
  applyRuntime(getDb())
  save()
  notify()
  channel?.postMessage('changed')
}

/** Stands in for Supabase Realtime: other tabs and roles see changes straight away. */
channel?.addEventListener('message', () => {
  db = load()
  notify()
})

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetDemoData() {
  db = createSeed()
  commit()
}

export interface ConfigContext {
  db: Database
  id: (prefix: string) => Id
}

/**
 * Write app owned configuration: staff, permissions, hours, the vehicle library and service profiles.
 * These live in Supabase later and are never sent to the back office system, so there is no outbox entry
 * and the result is always synced.
 */
export async function writeConfig<T>(apply: (ctx: ConfigContext) => T): Promise<Result<T>> {
  await latency()
  const database = getDb()
  const result = apply({ db: database, id: (prefix) => `${prefix}${++database.counters.id}` })
  commit()
  return { data: structuredClone(result), sync: SYNCED }
}

// ---- Settings -----------------------------------------------------------------

export function getSettings(): MockSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { simulateErrors: false, ...(JSON.parse(raw) as Partial<MockSettings>), writeMode: 'dry-run' }
  } catch {
    // defaults
  }
  return { simulateErrors: false, writeMode: 'dry-run' }
}

export function setSimulateErrors(on: boolean) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ simulateErrors: on }))
  notify()
}

// ---- Latency and errors ---------------------------------------------------------

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const latency = () => wait(120 + Math.random() * 280)

const SYNCED: SyncState = { status: 'synced' }

function syncFor(ids: Id[]): SyncState {
  const open = getDb().outbox.filter((e) => e.status !== 'synced' && ids.includes(e.entityId))
  const failed = open.find((e) => e.status === 'failed')
  if (failed) return { status: 'failed', error: failed.error }
  if (open.length) return { status: 'pending' }
  return SYNCED
}

/** Read through the mock engine. Returns a copy so screens cannot mutate the store. */
export async function read<T>(select: (db: Database) => T, entityIds: Id[] = []): Promise<Result<T>> {
  await latency()
  if (getSettings().simulateErrors && Math.random() < 0.12) {
    throw new DataError('Could not load. Check the connection and try again.')
  }
  return { data: structuredClone(select(getDb())), sync: syncFor(entityIds) }
}

export interface WriteContext {
  db: Database
  now: string
  actor: { id: Id; name: string }
  id: () => Id
  log: (jobId: Id, type: ActivityType, summary: string, metadata?: Record<string, unknown>) => void
}

/**
 * Write through the mock engine. The change is saved locally first, then queued in the outbox.
 * In later phases the outbox is a table and an Edge Function sends each entry to NetSuite.
 */
export async function write<T>(
  action: string,
  label: string,
  entityId: Id | ((result: T) => Id),
  apply: (ctx: WriteContext) => T,
): Promise<Result<T>> {
  await latency()
  const database = getDb()
  const user = getSession()
  const now = nowIso()
  const ctx: WriteContext = {
    db: database,
    now,
    actor: { id: user?.id ?? 'system', name: user?.name ?? 'System' },
    id: () => `x${++database.counters.id}`,
    log: (jobId, type, summary, metadata = {}) => {
      database.activity.push({
        id: `a${++database.counters.id}`, jobId, type, summary, metadata,
        actorId: ctx.actor.id, actorName: ctx.actor.name, occurredAt: now,
      })
    },
  }
  const result = apply(ctx)
  const id = typeof entityId === 'function' ? entityId(result) : entityId
  const entry: SyncLogEntry = {
    id: `o${++database.counters.id}`, action, label, entityId: id, status: 'pending', attempts: 0,
    createdAt: now, updatedAt: now, mode: 'dry-run', payload: { action, entityId: id, actor: ctx.actor.name },
  }
  database.outbox.push(entry)
  if (database.outbox.length > 200) database.outbox.splice(0, database.outbox.length - 200)
  markEntity(id, { status: 'pending' })
  commit()
  scheduleSend(entry.id, 900 + Math.random() * 900)
  return { data: structuredClone(result), sync: { status: 'pending' } }
}

// ---- Outbox ---------------------------------------------------------------------

function markEntity(id: Id, sync: SyncState) {
  const d = getDb()
  const entity =
    d.jobs.find((x) => x.id === id) ?? d.bookings.find((x) => x.id === id) ??
    d.vehicles.find((x) => x.id === id) ?? d.customers.find((x) => x.id === id)
  if (entity) entity.sync = sync
}

function scheduleSend(entryId: Id, delay: number) {
  setTimeout(() => send(entryId), delay)
}

/** Dry run only: records what would be sent, never sends it. */
function send(entryId: Id) {
  const d = getDb()
  const entry = d.outbox.find((e) => e.id === entryId)
  if (!entry || entry.status === 'synced') return
  entry.attempts++
  entry.updatedAt = nowIso()
  const fail = getSettings().simulateErrors && entry.attempts < 3 && Math.random() < 0.35
  if (fail) {
    entry.status = 'failed'
    entry.error = 'Back office system was busy (429). Retrying automatically.'
    scheduleSend(entryId, 4000 * entry.attempts)
  } else {
    entry.status = 'synced'
    entry.error = undefined
  }
  const stillOpen = d.outbox.filter((e) => e.entityId === entry.entityId && e.status !== 'synced')
  markEntity(
    entry.entityId,
    stillOpen.some((e) => e.status === 'failed')
      ? { status: 'failed', error: entry.error }
      : stillOpen.length
        ? { status: 'pending' }
        : { status: 'synced', lastSyncedAt: entry.updatedAt },
  )
  commit()
}

export function retryOutboxEntry(entryId: Id) {
  const entry = getDb().outbox.find((e) => e.id === entryId)
  if (!entry || entry.status === 'synced') return
  entry.status = 'pending'
  commit()
  scheduleSend(entryId, 600)
}
