/**
 * The only way screens reach data. Components import hooks from here, never the mock store,
 * Supabase or NetSuite.
 */
import { useEffect } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { AvailabilityRequest, BookingExtra, BookingItem, Id, LibraryFilters, Result } from '@/types'
import { subscribe } from './mock/store'
import * as live from './live-library'
import * as q from './queries'

function useData<T>(key: unknown[], fn: () => Promise<Result<T>>, enabled = true): UseQueryResult<Result<T>> {
  return useQuery({ queryKey: key, queryFn: fn, enabled, placeholderData: keepPreviousData })
}

/** Stands in for Supabase Realtime: any change, in this tab or another, refreshes what is on screen. */
export function useLiveData() {
  const client = useQueryClient()
  useEffect(() => subscribe(() => void client.invalidateQueries()), [client])
}

/** Wraps a business action. Screens show `isPending` and `error`; data refreshes through useLiveData. */
export function useAction<TArgs extends unknown[], T>(action: (...args: TArgs) => Promise<T>) {
  const mutation = useMutation({ mutationFn: (args: TArgs) => action(...args) })
  return {
    run: (...args: TArgs) => mutation.mutateAsync(args),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

export const useStaff = () => useData(['staff'], q.getStaff)
export const useTechnicians = () => useData(['technicians'], q.getTechnicians)
export const useBays = () => useData(['bays'], q.getBays)
export const useServiceTemplates = () => useData(['templates'], q.getServiceTemplates)
export const useRolePermissions = () => useData(['role-permissions'], q.getRolePermissions)
export const useWorkshopSettings = () => useData(['workshop-settings'], q.getWorkshopSettings)
export const useVehicleLibrary = () => useData(['vehicle-library'], q.getVehicleLibrary)
/** The synced vehicle library, filtered and paged in the database. */
export const useLibraryPage = (filters: LibraryFilters) =>
  useData(['library-page', filters], () => live.getLibraryPage(filters), live.edgeConfigured())
export const useSyncLibrary = () => {
  const client = useQueryClient()
  const action = useAction(async (dryRun: boolean) => {
    const result = await live.syncVehicleLibrary(dryRun)
    // Types follow the models, so refresh them straight after the models.
    const history = await live.enrichVehicleLibrary(dryRun)
    if (!dryRun) await client.invalidateQueries({ queryKey: ['library-page'] })
    return { ...result, history }
  })
  return action
}
export const useServiceProfiles = () => useData(['service-profiles'], q.getServiceProfiles)
export const useServiceActuals = () => useData(['service-actuals'], q.getServiceActuals)
export const useServicePlan = (vehicleId: Id | undefined, templateId: Id | undefined) =>
  useData(['service-plan', vehicleId, templateId], () => q.getServicePlan(vehicleId, templateId!), Boolean(templateId))

export const useSearch = (query: string) => useData(['search', query], () => q.searchEverything(query), query.trim().length >= 2)
export const useVehicles = (query: string) => useData(['vehicles', query], () => q.getVehicles(query))
export const useVehicle = (id: Id) => useData(['vehicle', id], () => q.getVehicle(id))
export const useVehicleTimeline = (id: Id) => useData(['vehicle-timeline', id], () => q.getVehicleTimeline(id))

export const useBookingCustomers = (query: string) =>
  useData(['booking-customers', query], () => q.findBookingCustomers(query), query.trim().length >= 2)
export const useBookingCustomer = (customerId: Id | undefined) =>
  useData(['booking-customer', customerId], () => q.getBookingCustomer(customerId!), Boolean(customerId))
export const useDuplicateCustomers =(input: Parameters<typeof q.findDuplicateCustomers>[0]) =>
  useData(['duplicates', input], () => q.findDuplicateCustomers(input), Object.values(input).some((v) => (v ?? '').trim().length >= 3))
export const useBookingHistory = (vehicleId: Id | undefined) =>
  useData(['booking-history', vehicleId], () => q.getBookingHistory(vehicleId!), Boolean(vehicleId))
export const useServiceSuggestions = (vehicleId: Id | undefined, odometerKm?: number) =>
  useData(['suggestions', vehicleId, odometerKm], () => q.getServiceSuggestions(vehicleId!, odometerKm), Boolean(vehicleId))
export const useBookingEstimate = (vehicleId: Id | undefined, templateIds: Id[], extras: BookingExtra[], items: BookingItem[] = []) =>
  useData(['estimate', vehicleId, templateIds, extras, items], () => q.getBookingEstimate(vehicleId!, templateIds, extras, items),
    Boolean(vehicleId) && templateIds.length + extras.length + items.length > 0)
export const useItems = () => useData(['items'], q.getItems)
export const useItemSearch = (query: string) =>
  useData(['item-search', query.trim().toLowerCase()], () => q.searchItems(query), query.trim().length > 0)
export const useMonthAvailability = (request: AvailabilityRequest | null, month: string) =>
  useData(['month-availability', request, month], () => q.getMonthAvailability(request!, month), request !== null)
export const useDayAvailability = (request: AvailabilityRequest | null, day: string | undefined) =>
  useData(['day-availability', request, day], () => q.getDayAvailability(request!, day!), request !== null && Boolean(day))

export const useSchedule =(fromDay: string, toDay: string) =>
  useData(['schedule', fromDay, toDay], () => q.getSchedule(fromDay, toDay))
export const useCapacity = (days: string[]) => useData(['capacity', ...days], () => q.getCapacity(days))
export const useAvailability = (request: AvailabilityRequest | null) =>
  useData(['availability', request], () => q.findAvailability(request!), request !== null)

export const useBookings = () => useData(['bookings'], q.getBookings)
export const useBooking = (id: Id) => useData(['booking', id], () => q.getBooking(id))
export const useJobCard = (id: Id) => useData(['booking', id], () => q.getJobCard(id))
export const useWorkshopBoard = (day: string) => useData(['board', day], () => q.getWorkshopBoard(day))
export const useAssignPlan = (jobId: Id | undefined, day: string) =>
  useData(['assign-plan', jobId, day], () => q.getAssignPlan(jobId!, day), Boolean(jobId))
export const useMyDay = (technicianId: Id | undefined, day: string) =>
  useData(['my-day', technicianId, day], () => q.getMyDay(technicianId!, day), Boolean(technicianId))
export const useCompletedJobs = (technicianId: Id | undefined) =>
  useData(['completed', technicianId], () => q.getCompletedJobs(technicianId!), Boolean(technicianId))

export const useQuote = (jobId: Id) => useData(['quote', jobId], () => q.getQuote(jobId))
export const useInvoiceSummary = (jobId: Id) => useData(['invoice', jobId], () => q.getInvoiceSummary(jobId))
export const useActivity = (jobId: Id) => useData(['activity', jobId], () => q.getActivity(jobId))

export const useTodaySummary = (day: string) => useData(['today', day], () => q.getTodaySummary(day))
export const useUtilisationReport = () => useData(['utilisation'], q.getUtilisationReport)
export const useSyncLog = () => useData(['sync-log'], q.getSyncLog)

export const usePartOrders = () => useData(['part-orders'], q.getPartOrders)
export const useJobPartOrders = (jobId: Id) => useData(['part-orders', jobId], () => q.getJobPartOrders(jobId))
