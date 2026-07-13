/**
 * URN Registry — canonicalises free-text material / standard / partner names
 * into stable URNs. Seeded from the composite-manufacturing domain;
 * extendable at runtime via `NormalizerService.registerUrn`.
 *
 * URN scheme: `urn:digital-thread:<kind>:<slug>`.
 */
export type UrnKind = 'material' | 'standard' | 'partner' | 'component'

export interface UrnEntry {
  urn: string
  canonicalName: string
  aliases: string[]
}

const SEED: Record<UrnKind, UrnEntry[]> = {
  material: [
    { urn: 'urn:digital-thread:material:as4-3501-6', canonicalName: 'AS4/3501-6', aliases: ['as4/3501-6', 'as4 3501-6', 'as4_3501_6'] },
    { urn: 'urn:digital-thread:material:im7-977-3',  canonicalName: 'IM7/977-3',  aliases: ['im7/977-3', 'im7 977-3'] },
    { urn: 'urn:digital-thread:material:t700-paek',  canonicalName: 'T700/PAEK',  aliases: ['t700/paek', 't700 paek', 't700-paek'] },
  ],
  standard: [
    { urn: 'urn:digital-thread:standard:as9100d',    canonicalName: 'AS9100D',    aliases: ['as 9100d', 'as9100'] },
    { urn: 'urn:digital-thread:standard:astm-d3039', canonicalName: 'ASTM D3039', aliases: ['astm d3039', 'astm-d3039', 'd3039'] },
    { urn: 'urn:digital-thread:standard:espr-2027',  canonicalName: 'ESPR 2027',  aliases: ['espr', 'espr2027'] },
  ],
  partner: [
    { urn: 'urn:digital-thread:partner:cai',     canonicalName: 'CAI',     aliases: ['collins aerospace ireland', 'collins aerospace'] },
    { urn: 'urn:digital-thread:partner:aimplas', canonicalName: 'AIMPLAS', aliases: ['aimplas'] },
  ],
  component: [],
}

export class UrnRegistry {
  private entries: Record<UrnKind, UrnEntry[]>

  constructor(seed: Record<UrnKind, UrnEntry[]> = SEED) {
    this.entries = {
      material: [...seed.material],
      standard: [...seed.standard],
      partner:  [...seed.partner],
      component:[...seed.component],
    }
  }

  resolve(kind: UrnKind, rawName: string): string | null {
    if (!rawName) return null
    const needle = rawName.toLowerCase().trim()
    const exactUrn = this.entries[kind].find((e) => e.urn === rawName)
    if (exactUrn) return exactUrn.urn
    const match = this.entries[kind].find((e) =>
      e.canonicalName.toLowerCase() === needle || e.aliases.some((a) => a.toLowerCase() === needle),
    )
    return match?.urn ?? null
  }

  register(kind: UrnKind, entry: UrnEntry) {
    const existing = this.entries[kind].find((e) => e.urn === entry.urn)
    if (existing) {
      existing.canonicalName = entry.canonicalName
      existing.aliases = Array.from(new Set([...existing.aliases, ...entry.aliases]))
    } else {
      this.entries[kind].push(entry)
    }
  }

  listAll(): Record<UrnKind, UrnEntry[]> {
    return this.entries
  }
}
