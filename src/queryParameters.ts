import type {RatioString} from '#src/lib/ratio.ts'

import readPermalink, {parseNumber} from 'read-permalink'

import {defaultFeatherMethodId, featherMethodIds, isFeatherMethodId, parseFeatherMethodId} from '#src/lib/feather/featherMethodIds.ts'
import {normalizeOpenRouterHost, normalizeOpenRouterKey, openRouterOrigin} from '#src/lib/openRouterAccess.ts'
import {isRatioString} from '#src/lib/ratio.ts'

const optionalString = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
const fraction = (value: unknown) => {
  const number = parseNumber(value)
  // Percentages like “35” are accepted as well as fractions like “0.35”.
  const normalized = number > 1 ? number / 100 : number
  return Math.min(1, Math.max(0, normalized))
}
const featherMethod = (value: unknown) => {
  const id = parseFeatherMethodId(value)
  if (!isFeatherMethodId(String(value).trim().toLowerCase())) {
    console.warn(`Unknown feather_method “${String(value)}”, using “${id}”. Available: ${featherMethodIds.join(', ')}`)
  }
  return id
}
/** comma-separated ratios written as “16/9”, “16:9” or a bare “1” for 1:1 */
const ratioList = (value: unknown) => {
  const ratios: Array<RatioString> = []
  for (const item of optionalString(value).split(',')) {
    const trimmed = item.trim()
    if (!trimmed) {
      continue
    }
    const ratio = /[/:]/.test(trimmed) ? trimmed.replace('/', ':') : `${trimmed}:1`
    if (!isRatioString(ratio)) {
      console.warn(`Ignoring invalid ratio “${trimmed}” in ratios`)
      continue
    }
    if (!ratios.includes(ratio)) {
      ratios.push(ratio)
    }
  }
  return ratios
}
const defaultTransparentColor = '#333'
/** any CSS color; bare hex digits like “333” get a “#”, since a literal “#” in a URL starts the fragment */
const cssColor = (value: unknown) => {
  const trimmed = optionalString(value).trim()
  const color = /^(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(trimmed) ? `#${trimmed}` : trimmed
  const valid = typeof CSS === 'undefined' ? /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color) : CSS.supports('color', color)
  if (!valid) {
    console.warn(`Unknown transparent_color “${trimmed}”, using “${defaultTransparentColor}”`)
    return defaultTransparentColor
  }
  return color
}
const queryParameters = readPermalink(typeof location === 'undefined' ? '' : location.href, {schema: {
  defaults: {
    /** OpenRouter image model to use, with or without vendor prefix */
    model: 'google\u{2F}gemini-nano-banana-2.1',
    /** frame aspect ratio like “16:9”; falls back to the closest ratio the model supports */
    ratio: '1:1',
    /** resolution tier like “1K”, “2K” or “4K”; empty uses the model default */
    resolution: '',
    /** quality level for models that support it; empty uses the model default */
    quality: '',
    /** initial prompt text, overrides the stored prompt */
    prompt: '',
    /** default feathering for new generated layers, 0–1 or 0–100 */
    feather: 0,
    /** default mask area for new generated layers, 0–1 or 0–100 */
    area: 1,
    /** feather algorithm: “smooth” (default; crease-free contours that also hide where the artwork below ends) or “distance” (the original signed-distance ramp) */
    feather_method: defaultFeatherMethodId,
    /** OpenAI-compatible base URL like “http://127.0.0.1:8317/v1” (CLIProxyAPI); when set, generations go there through the AI SDK instead of OpenRouter */
    ai_endpoint: '',
    /** the origin serving OpenRouter’s API, like an OpenRouter proxy or another server speaking the same API; a bare host like “openrouter.nas.lan” means HTTPS */
    openrouter_host: openRouterOrigin,
    /** the browser-session key this tab starts with, or false to send every request without one and lock the key input, for a host that adds its own */
    openrouter_key: undefined as false | string | undefined,
    /** aspect ratios of the model_id model like “1,3/4,4/3,16/9,9/16”; empty inherits them from a matching catalog model or uses a common set */
    ratios: '',
    /** color that stands in for empty canvas in generation inputs, like “555”, “%23555” or “gray” */
    transparent_color: defaultTransparentColor,
  },
  normalizations: {
    model: String,
    ratio: String,
    resolution: optionalString,
    quality: optionalString,
    prompt: optionalString,
    feather: fraction,
    area: fraction,
    feather_method: featherMethod,
    ai_endpoint: (value: unknown) => optionalString(value).trim(),
    openrouter_host: normalizeOpenRouterHost,
    openrouter_key: normalizeOpenRouterKey,
    ratios: ratioList,
    transparent_color: cssColor,
  },
}})

/** keys that were explicitly present in the URL and therefore win over persisted settings */
export const explicitQueryKeys = new Set(typeof location === 'undefined' ? [] : new URLSearchParams(location.search).keys())

/**
 * model IDs from every model_id parameter, in URL order, like “?model_id=grok-imagine-image-2.0&model_id=gpt-image-2.5-sunburst”
 *
 * Each one is added to the model picker; the first is selected unless a saved selection is one of them. Meant for models that ai_endpoint serves but the catalog lacks.
 */
const modelIdParameters = typeof location === 'undefined' ? [] : new URLSearchParams(location.search).getAll('model_id')
export const customModelIds: ReadonlyArray<string> = [...new Set(modelIdParameters.map(id => id.trim()).filter(Boolean))]

export default queryParameters
