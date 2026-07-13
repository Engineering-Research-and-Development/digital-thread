import { COUNTRIES } from '@/data/countries'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Reusable ISO 3166-1 alpha-2 country picker. Stores the 2-letter code.
 * Radix Select provides built-in typeahead (start typing a country name).
 * Shared by Settings → Partners and the Profile page.
 */
export function CountrySelect({
  value,
  onChange,
  id,
  disabled,
  placeholder = 'Select country…',
}: {
  value?: string
  onChange: (code: string) => void
  id?: string
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {COUNTRIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.name} ({c.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
