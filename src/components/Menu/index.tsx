import type {ComponentProps, CSSProperties, KeyboardEvent, ReactNode, Ref} from 'react'

import clsx from 'clsx'
import {createContext, use} from 'react'

import {getErrorMessage, notify} from '#src/lib/notices.ts'

import css from './style.module.sass'

/** everything the arrow keys move between */
export const focusableSelector = 'button:not(:disabled), select:not(:disabled)'
/** closes whatever holds the menu, like a context menu or a dialog */
const CloseContext = createContext<() => void>(() => {})
const navigationKeys = new Set(['ArrowDown', 'ArrowUp', 'End', 'Home'])

type Props = {
  'aria-label': string
  children: ReactNode
  className?: string
  onClose: () => void
  ref?: Ref<HTMLDivElement>
  style?: CSSProperties
}

/** A list of actions. The arrow keys, Home and End move between its items; Escape and every action close it. */
export default function Menu({children, className, onClose, ref, ...props}: Props) {
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (!navigationKeys.has(event.key)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector)]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'Home' ? 0 : (event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
    items[next]?.focus()
  }
  return <div className={clsx(css.menu, className)} data-overlay-control role='menu' ref={ref} onContextMenu={event => event.preventDefault()} onKeyDown={navigate} {...props}>
    <CloseContext value={onClose}>{children}</CloseContext>
  </div>
}

/** Closes the menu first, then runs the action and reports failures. */
export const useMenuAction = () => {
  const close = use(CloseContext)
  return (action: () => unknown) => {
    close()
    Promise.try(action).catch((error: unknown) => notify('error', getErrorMessage(error)))
  }
}

export function MenuItem({onSelect, ...props}: Omit<ComponentProps<'button'>, 'onClick' | 'onSelect'> & {onSelect: () => unknown}) {
  const run = useMenuAction()
  return <button role='menuitem' type='button' {...props} onClick={() => run(onSelect)} />
}

/** a labeled control like a dropdown, which keeps the menu open while it is used */
export function MenuRow({children, label}: {
  children: ReactNode
  label: string
}) {
  return <label className={css.row}><span>{label}</span>{children}</label>
}

export function MenuGroup({children, title}: {
  children: ReactNode
  title: string
}) {
  return <div className={css.group} aria-label={title} role='group'>
    <span className={css.groupTitle} aria-hidden>{title}</span>
    {children}
  </div>
}
