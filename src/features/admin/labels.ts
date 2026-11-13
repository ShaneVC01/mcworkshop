import type { FuelType, Skill, VehicleClass } from '@/types'

export const SKILL_OPTIONS: { value: Skill; label: string }[] = [
  { value: 'servicing', label: 'Servicing' },
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'brakes', label: 'Brakes' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'accessories', label: 'Accessories' },
]

export const VEHICLE_CLASS_LABEL: Record<VehicleClass, string> = {
  '4wd': '4WD',
  passenger: 'Passenger car',
  'light-commercial': 'Light commercial',
}

export const FUEL_LABEL: Record<FuelType, string> = { diesel: 'Diesel', petrol: 'Petrol', hybrid: 'Hybrid', electric: 'Electric' }
