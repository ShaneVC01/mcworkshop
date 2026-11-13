/**
 * Which service profile applies to a vehicle. Pure functions, used by the data layer.
 *
 * Order of preference:
 *   1. A profile for the vehicle's make and model that refines the chosen service.
 *   2. The generic template itself.
 * The prototype matches the vehicle's make and model text to the library. Once the library is read from
 * the back office system, vehicles will carry the library entry's ID and this matching goes away.
 */
import type { ServicePlan, ServiceProfile, ServiceTemplate, Vehicle, VehicleModel } from '@/types'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const numberIn = (s: string) => s.match(/\d+/)?.[0]

/** Best library entry for a vehicle, or undefined when the library has nothing that fits. */
export function findLibraryModel(
  vehicle: Pick<Vehicle, 'make' | 'model' | 'year'>,
  library: VehicleModel[],
): VehicleModel | undefined {
  const make = norm(vehicle.make)
  const model = norm(vehicle.model)
  const vehicleNumber = numberIn(model)
  let best: { entry: VehicleModel; score: number } | undefined

  for (const entry of library) {
    if (!entry.active || norm(entry.make) !== make) continue
    const name = norm(entry.model)
    if (model !== name && !model.startsWith(`${name} `)) continue
    if (vehicle.year && (vehicle.year < entry.yearFrom || (entry.yearTo && vehicle.year > entry.yearTo))) continue

    const seriesNumber = entry.series ? numberIn(entry.series) : undefined
    // A series entry only fits when the vehicle's own text agrees, or says nothing about a series.
    if (seriesNumber && vehicleNumber && seriesNumber !== vehicleNumber) continue
    const score = seriesNumber && vehicleNumber === seriesNumber ? 3 : seriesNumber ? 1 : 2
    if (!best || score > best.score) best = { entry, score }
  }
  return best?.entry
}

export function describeModel(m: Pick<VehicleModel, 'make' | 'model' | 'series'>) {
  return [m.make, m.model, m.series].filter(Boolean).join(' ')
}

/** What a booking uses for this vehicle and service: the profile if there is one, otherwise the generic template. */
export function resolveServicePlan(
  template: ServiceTemplate,
  vehicle: Pick<Vehicle, 'make' | 'model' | 'year'> | undefined,
  library: VehicleModel[],
  profiles: ServiceProfile[],
  labourRateCents: number,
): ServicePlan {
  const model = vehicle ? findLibraryModel(vehicle, library) : undefined
  const profile = model ? profiles.find((p) => p.active && p.templateId === template.id && p.modelId === model.id) : undefined
  if (!profile) return { template, source: 'generic', model, labourRateCents }
  return {
    template: {
      ...template,
      labourHours: profile.labourHours,
      parts: profile.parts,
      checklist: profile.checklist ?? template.checklist,
    },
    source: 'profile',
    profile,
    model,
    labourRateCents,
  }
}
