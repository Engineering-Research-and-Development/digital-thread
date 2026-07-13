/**
 * QUDT-aligned unit converter — minimal subset.
 *
 * Supports the physical quantities that show up in composite-manufacturing
 * workflows: temperature, pressure, time, mass, force, energy, length.
 * Each conversion goes to a canonical SI unit; downstream consumers
 * re-convert as needed.
 *
 * Extend `TABLE` to cover additional QUDT unit IRIs. Values are the
 * multiplier to canonical unit (+ optional offset for temperature).
 */
export type UnitSymbol = string

type Conv = { canonical: string; factor: number; offset?: number }

const TABLE: Record<UnitSymbol, Conv> = {
  // Temperature (canonical: K)
  'K':   { canonical: 'K', factor: 1 },
  '°C':  { canonical: 'K', factor: 1, offset: 273.15 },
  'degC':{ canonical: 'K', factor: 1, offset: 273.15 },
  '°F':  { canonical: 'K', factor: 5 / 9, offset: 459.67 * (5 / 9) },
  'degF':{ canonical: 'K', factor: 5 / 9, offset: 459.67 * (5 / 9) },
  // Pressure (canonical: Pa)
  'Pa':  { canonical: 'Pa', factor: 1 },
  'kPa': { canonical: 'Pa', factor: 1000 },
  'MPa': { canonical: 'Pa', factor: 1e6 },
  'bar': { canonical: 'Pa', factor: 1e5 },
  'psi': { canonical: 'Pa', factor: 6894.757 },
  // Time (canonical: s)
  's':   { canonical: 's', factor: 1 },
  'ms':  { canonical: 's', factor: 0.001 },
  'min': { canonical: 's', factor: 60 },
  'h':   { canonical: 's', factor: 3600 },
  // Mass (canonical: kg)
  'kg':  { canonical: 'kg', factor: 1 },
  'g':   { canonical: 'kg', factor: 0.001 },
  'lb':  { canonical: 'kg', factor: 0.45359237 },
  // Force (canonical: N)
  'N':   { canonical: 'N', factor: 1 },
  'kN':  { canonical: 'N', factor: 1000 },
  'lbf': { canonical: 'N', factor: 4.4482216 },
  // Length (canonical: m)
  'm':   { canonical: 'm', factor: 1 },
  'mm':  { canonical: 'm', factor: 0.001 },
  'cm':  { canonical: 'm', factor: 0.01 },
  'in':  { canonical: 'm', factor: 0.0254 },
  // Energy (canonical: J)
  'J':   { canonical: 'J', factor: 1 },
  'kJ':  { canonical: 'J', factor: 1000 },
  'Wh':  { canonical: 'J', factor: 3600 },
  'kWh': { canonical: 'J', factor: 3_600_000 },
}

export function toCanonical(value: number, unit: UnitSymbol): { value: number; unit: string } {
  const c = TABLE[unit]
  if (!c) throw new Error(`Unknown unit: ${unit}`)
  return { value: value * c.factor + (c.offset ?? 0), unit: c.canonical }
}

export function convert(value: number, fromUnit: UnitSymbol, toUnit: UnitSymbol): number {
  const a = TABLE[fromUnit]; const b = TABLE[toUnit]
  if (!a || !b) throw new Error(`Unknown unit in conversion: ${fromUnit} → ${toUnit}`)
  if (a.canonical !== b.canonical) throw new Error(`Incompatible dimensions: ${fromUnit} (${a.canonical}) → ${toUnit} (${b.canonical})`)
  const canon = value * a.factor + (a.offset ?? 0)
  return (canon - (b.offset ?? 0)) / b.factor
}

export function isKnownUnit(u: string): boolean {
  return u in TABLE
}

export function supportedUnits(): string[] {
  return Object.keys(TABLE)
}
