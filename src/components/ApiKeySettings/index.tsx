import clsx from 'clsx'
import {KeyRound} from 'lucide-react'
import {useEffect, useId, useRef, useState} from 'react'

import {apiKeyStore, hasApiKey, keyless, setApiKey} from '#src/lib/apiKey.ts'
import {getOpenRouterHostTitle} from '#src/lib/openRouterAccess.ts'
import {useStore} from '#src/lib/store/index.ts'
import queryParameters from '#src/queryParameters.ts'

import css from './style.module.sass'

const host = getOpenRouterHostTitle(queryParameters.openrouter_host)
const getLabel = (key: string) => {
  if (keyless) {
    return 'Host key'
  }
  return key ? 'Session key' : 'API key'
}
const hint = keyless ? `Requests go to ${host} without a key, and it adds its own.` : `Kept in memory for this tab only and sent directly to ${host}. It is forgotten on reload.`
/** popover for entering the OpenRouter API key, which is kept in memory only */
const ApiKeySettings = () => {
  const id = useId()
  const popoverId = `api-key-${id}`
  const {key, requested} = useStore(apiKeyStore)
  const [draft, setDraft] = useState(key)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const configured = hasApiKey()
  useEffect(() => {
    if (requested) {
      apiKeyStore.set({requested: false})
      popoverRef.current?.showPopover()
      inputRef.current?.focus()
    }
  }, [requested])
  const save = () => {
    setApiKey(draft)
    popoverRef.current?.hidePopover()
  }
  return <>
    <button
      className={clsx(css.trigger, !configured && css.missing)}
      popoverTarget={popoverId}
      style={{anchorName: `--${popoverId}`}}
      title={configured ? 'OpenRouter API key' : 'Add your OpenRouter API key'}
      type='button'
    >
      <KeyRound aria-hidden size={15} strokeWidth={1.6} />
      <span>{getLabel(key)}</span>
    </button>
    <div
      id={popoverId} className={css.popover} popover='auto' style={{positionAnchor: `--${popoverId}`}} ref={popoverRef} onToggle={event => {
        if (event.newState === 'open') {
          setDraft(apiKeyStore.state.key)
        }
      }}
    >
      <form
        className={css.form} onSubmit={event => {
          event.preventDefault()
          save()
        }}
      >
        <label className={css.label} htmlFor={`${popoverId}-input`}>OpenRouter API key</label>
        <input
          id={`${popoverId}-input`}
          className={css.input}
          autoComplete='off'
          disabled={keyless}
          placeholder={keyless ? `Added by ${host}` : 'sk-or-v1-…'}
          spellCheck={false}
          type='password'
          value={keyless ? '' : draft}
          ref={inputRef}
          onChange={event => setDraft(event.currentTarget.value)}
        />
        <p className={css.hint}>
          {hint}{!keyless && <> Create one at <a href='https://openrouter.ai/settings/keys' rel='noreferrer' target='_blank'>openrouter.ai/settings/keys</a>.</>}
        </p>
        {!keyless && <div className={css.actions}>
          {key && <button
            className={css.secondary} type='button' onClick={() => {
              setDraft('')
              setApiKey('')
            }}
          >Forget</button>}
          <button className={css.primary} type='submit'>Save</button>
        </div>}
      </form>
    </div>
  </>
}

export default ApiKeySettings
