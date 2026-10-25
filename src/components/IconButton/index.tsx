import type {LucideIcon} from 'lucide-react'
import type {ComponentProps} from 'react'

import clsx from 'clsx'

import css from './style.module.sass'

type Props = ComponentProps<'button'> & {
  active?: boolean
  icon: LucideIcon
  size?: number
}

/** compact icon button; the title doubles as accessible name */
const IconButton = ({active, className, icon: Icon, size = 16, type = 'button', ...props}: Props) => <button
  className={clsx(css.button, active && css.active, className)}
  aria-label={props['aria-label'] ?? props.title}
  aria-pressed={active}
  type={type}
  {...props}
>
  <Icon aria-hidden nonScalingStroke size={size} strokeWidth={1.6} />
</button>

export default IconButton
