import { usePartnerStore } from '@/stores/partner-store'

/**
 * Get the color for a partner by name.
 * Falls back to the partner-store, then to a default gray.
 * Also handles composite partner names like "AIM / MSQ" by matching any component.
 */
export function getPartnerColor(name: string): string {
  const { partners } = usePartnerStore.getState()
  const partnerList = Object.values(partners)

  // Direct match
  const direct = partnerList.find((p) => p.name === name)
  if (direct) return direct.color

  // Composite match: "AIM / MSQ" → try matching "AIM" or "MSQ"
  const parts = name.split(/\s*\/\s*/)
  for (const part of parts) {
    const match = partnerList.find((p) => p.name === part)
    if (match) return match.color
  }

  return '#94A3B8'
}
