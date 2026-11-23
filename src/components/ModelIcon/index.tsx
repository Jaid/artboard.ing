import type {ModelIcon as ModelIconType} from '#src/lib/models/modelTraits.ts'
import type {CSSProperties} from 'react'

import clsx from 'clsx'

import css from './style.module.sass'

type Props = {
  className?: string
  icon?: ModelIconType
  size?: number
}

/** a monochrome icon is a mask filled with the text color, a colored one is drawn as is; models without an icon keep the space free so titles stay aligned */
const ModelIcon = ({className, icon, size = 16}: Props) => <span
  className={clsx(css.icon, icon?.monochrome && css.monochrome, className)}
  aria-hidden
  style={{
    '--size': `${size}px`,
    ...icon ? {'--icon': `url("${icon.url}")`} : {},
  } as CSSProperties}
/>

export default ModelIcon
