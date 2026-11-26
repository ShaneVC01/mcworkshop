/**
 * Which scheduled service a vehicle needs, from its odometer reading. Pure functions, used by the data layer.
 *
 * The next service milestone is the next 10,000 km mark, allowing 2,000 km either side
 * (133,000 km and 141,500 km both point at 140,000 km). The service for that milestone is the
 * largest scheduled service whose interval divides it, because a bigger service includes the
 * smaller ones (120,000 km gets the major service, 150,000 km gets the 30,000 km service).
 * Services that do not fit the milestone are left out of the quick list but can still be searched.
 */
import { findLibraryModel, resolveServicePlan } from '@/lib/service-profiles'
import type { ServiceProfile, ServiceSuggestion, ServiceTemplate, Vehicle, VehicleModel } from '@/types'

export const MILESTONE_KM = 10_000
const TOLERANCE_KM = 2_000

export function nextMilestone(odometerKm: number) {
  return Math.max(MILESTONE_KM, Math.ceil((odometerKm - TOLERANCE_KM) / MILESTONE_KM) * MILESTONE_KM)
}

const km = (n: number) => new Intl.NumberFormat('en-AU').format(n)

/** True when a template suits this kind of vehicle, or the vehicle is not in the library. */
export function templateFits(template: ServiceTemplate, model: VehicleModel | undefined) {
  if (!model) return true
  return (!template.vehicleClass || template.vehicleClass === model.vehicleClass) && (!template.fuel || template.fuel === model.fuel)
}

export const isScheduled = (t: ServiceTemplate) => t.category === 'Scheduled service' && Boolean(t.intervalKm)

export function suggestServices(
  templates: ServiceTemplate[],
  vehicle: Pick<Vehicle, 'make' | 'model' | 'year' | 'odometerKm'>,
  library: VehicleModel[],
  profiles: ServiceProfile[],
  labourRateCents: number,
): ServiceSuggestion[] {
  const model = findLibraryModel(vehicle, library)
  const scheduled = templates.filter((t) => t.active !== false && isScheduled(t) && templateFits(t, model))
  const hours = (t: ServiceTemplate) => resolveServicePlan(t, vehicle, library, profiles, labourRateCents).template.labourHours

  if (!vehicle.odometerKm) {
    return scheduled.map((t) => ({
      templateId: t.id, label: t.name, labourHours: hours(t), reason: 'Enter the odometer reading to narrow this down.',
    }))
  }

  const milestone = nextMilestone(vehicle.odometerKm)
  const due = scheduled.filter((t) => milestone % t.intervalKm! === 0)
  const largest = Math.max(0, ...due.map((t) => t.intervalKm!))
  return due
    .filter((t) => t.intervalKm === largest)
    .map((t) => {
      // Keep any variant wording, for example "4WD diesel", so staff can tell two versions apart.
      const variant = t.name.split(', ').slice(1).join(', ')
      return {
        templateId: t.id,
        label: `${km(milestone)} km service${variant ? `, ${variant}` : ''}`,
        labourHours: hours(t),
        reason: `Due at ${km(milestone)} km. Reading is ${km(vehicle.odometerKm!)} km. Uses the ${t.name.split(', ')[0]} work.`,
      }
    })
}
