import {parseBoolean} from 'read-permalink'

/** the origin of OpenRouter’s own API */
export const openRouterOrigin = 'https://openrouter.ai'

/** the origin of an HTTP(S) URL or of a bare host, which means HTTPS, and OpenRouter’s own for anything else */
export const normalizeOpenRouterHost = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return openRouterOrigin
  }
  const host = value.trim()
  const url = URL.parse(/^[a-z][\d+\-.a-z]*:\/\//iu.test(host) ? host : `https://${host}`)
  return url && (url.protocol === 'https:' || url.protocol === 'http:') ? url.origin : openRouterOrigin
}

/** `false` for a `false` or `0` flag, a non-blank key as given, and `undefined` for anything else, which leaves the key input empty */
export const normalizeOpenRouterKey = (value: unknown): false | string | undefined => {
  try {
    return parseBoolean(value) && undefined
  } catch {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
}

/** a short name for `origin` in user-facing text: “OpenRouter” for its own, the host otherwise */
export const getOpenRouterHostTitle = (origin: string) => {
  if (origin === openRouterOrigin) {
    return 'OpenRouter'
  }
  const url = new URL(origin)
  return url.host
}
