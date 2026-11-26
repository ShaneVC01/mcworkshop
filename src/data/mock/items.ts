/**
 * Mock items list: what can go on a job as a line. Shaped like the back office item list
 * (see docs/netsuite-mapping.md, "Items and job lines"): parts are found by part number and class,
 * labour is sold by the hour with a few fixed time fitting jobs, and charges are one off fees.
 * Codes for labour and charges follow the back office. Part prices are illustrative.
 */
import type { CatalogueItem } from '@/types'

const labour = (id: string, code: string, name: string, unitCents: number, extra: Partial<CatalogueItem> = {}): CatalogueItem => ({
  id, code, name, kind: 'labour', category: 'Labour', unitCents, unit: 'hour', active: true, ...extra,
})
const part = (id: string, code: string, name: string, category: string, unitCents: number, fitting?: CatalogueItem['fitting'], extra: Partial<CatalogueItem> = {}): CatalogueItem => ({
  id, code, name, kind: 'part', category, unitCents, unit: 'each', fitting, active: true, ...extra,
})
const charge = (id: string, code: string, name: string, unitCents: number): CatalogueItem => ({
  id, code, name, kind: 'charge', category: 'Charges', unitCents, unit: 'each', active: true,
})

const fit = (itemId: string, hours: number) => ({ itemId, hours })

/** Parts ordered in for the job, with working days to arrive. Every other part is kept in stock. Illustrative. */
const ORDERED_IN: Record<string, number> = {
  'i-db2219': 3, 'i-dba2716e': 5, 'i-dba2780': 4, 'i-cvhilux': 4, 'i-ome-f': 7, 'i-ome-r': 7, 'i-tyre-at': 3, 'i-6pk1873': 2,
}

const LIST: CatalogueItem[] = [
  // Labour by the hour. LAB is what the service groups use, LAB4WD for 4WD work, LABELEC for auto electrical.
  labour('i-lab', 'LAB', 'Labour, general', 15000),
  labour('i-lab4wd', 'LAB4WD', 'Labour, 4WD', 15000),
  labour('i-labelec', 'LABELEC', 'Labour, auto electrical', 16500, { skill: 'electrical' }),
  // Fixed time fitting jobs.
  labour('i-labair', 'LABAIRFILTER', 'Engine air filter replacement', 15000, { standardHours: 0.15 }),
  labour('i-labcabin', 'LABCABIN', 'Cabin filter replacement', 15000, { standardHours: 0.25 }),
  labour('i-labfbrake', 'LABFBRAKE', 'Front brake pads, fit', 15000, { standardHours: 1, skill: 'brakes' }),
  labour('i-labrbrake', 'LABRBRAKE', 'Rear brake pads, fit', 15000, { standardHours: 1.2, skill: 'brakes' }),
  labour('i-labdrum', 'LABDRUMBRAKE', 'Rear drum brake service', 15000, { standardHours: 1.5, skill: 'brakes' }),
  labour('i-labsusp', 'LABSUSPCHECK', 'Suspension check', 15000, { standardHours: 1, skill: 'suspension' }),
  labour('i-wat4wd', 'WAT4WD', 'Wheel alignment, 4WD', 13700, { standardHours: 1, skill: 'suspension' }),

  // Parts, by class.
  part('i-psa561', 'PSA561', 'Engine air filter', 'Air filters', 3500, fit('i-labair', 0.15)),
  part('i-pcf631a', 'PCF631A', 'Cabin filter', 'Cabin filters', 3800, fit('i-labcabin', 0.25)),
  part('i-z929', 'Z929', 'Oil filter, diesel', 'Oil filters', 3200),
  part('i-rca164p', 'RCA164P', 'Fuel filter, diesel', 'Fuel filter', 4900, fit('i-lab4wd', 0.5)),
  part('i-db1482', 'DB1482 4WD', 'Front brake pads, Hilux and Prado', 'Brakes and rotors', 9800, fit('i-labfbrake', 1)),
  part('i-db1840', 'DB1840 4WD', 'Front brake pads, Ranger and BT-50', 'Brakes and rotors', 10500, fit('i-labfbrake', 1)),
  part('i-db2219', 'DB2219 4WD', 'Rear brake pads, LandCruiser 200', 'Brakes and rotors', 11500, fit('i-labrbrake', 1.2)),
  part('i-dba2716e', 'DBA2716E', 'Front disc rotor, Ranger and BT-50', 'Brakes and rotors', 18500, fit('i-lab4wd', 0.5)),
  part('i-dba2780', 'DBA2780', 'Front disc rotor, Hilux', 'Brakes and rotors', 17200, fit('i-lab4wd', 0.5)),
  part('i-bfdot4', 'BF-DOT4-1L', 'Brake fluid, DOT 4, 1 L', 'Oils and grease', 2400),
  part('i-oil1540', '3413003', 'Engine oil, 15W-40 diesel', 'Oils and grease', 1350, undefined, { unit: 'litre' }),
  part('i-coolant', 'COOL-LL-5L', 'Coolant, long life, 5 L', 'Oils and grease', 4500),
  part('i-n70zz', 'N70ZZMF', 'Battery, 4WD, 760 CCA', 'Batteries', 28900, fit('i-labelec', 0.3)),
  part('i-h4', 'H4-12V', 'Headlight globe, H4', 'Lights and switches', 1800, fit('i-lab', 0.2)),
  part('i-wb22', 'WB22', 'Wiper blade, 22 inch', 'Accessories', 2200),
  part('i-6pk1873', '6PK1873', 'Drive belt, serpentine', 'Drive belts', 6400, fit('i-lab4wd', 0.8)),
  part('i-glow', 'GP-HJ61', 'Glow plug', 'Mechanical part', 3200, fit('i-lab4wd', 0.5)),
  part('i-cvhilux', 'CV-HLX-F', 'CV joint assembly, front, Hilux', 'Mechanical part', 42000, fit('i-lab4wd', 1.5)),
  part('i-ome-f', 'OME-90000', 'Shock absorber, front', 'Suspension', 23900, fit('i-lab4wd', 1)),
  part('i-ome-r', 'OME-60000', 'Shock absorber, rear', 'Suspension', 19900, fit('i-lab4wd', 0.6)),
  part('i-tyre-at', 'AT-2656517', 'Tyre, 265/65R17 all terrain', 'Tyres', 28900, fit('i-lab4wd', 0.25)),

  // One off charges.
  charge('i-wc', 'WC', 'Workshop consumables', 3000),
  charge('i-twr', 'TWR', 'Toxic waste removal', 1500),
  charge('i-freight', 'FREIGHT', 'Freight', 2500),
]

export const ITEMS: CatalogueItem[] = LIST.map((i) =>
  i.kind === 'part' ? { ...i, stocked: !(i.id in ORDERED_IN), leadTimeDays: ORDERED_IN[i.id] } : i,
)
