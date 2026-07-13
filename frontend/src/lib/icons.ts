import * as Icons from 'lucide-react'
import type { ComponentType } from 'react'

type IconProps = { className?: string; style?: React.CSSProperties }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const iconMap = Icons as unknown as Record<string, ComponentType<IconProps>>

export function getIcon(name: string): ComponentType<IconProps> | undefined {
  return iconMap[name]
}
