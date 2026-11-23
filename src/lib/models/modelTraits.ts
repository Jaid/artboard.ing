import type {RatioString} from '../ratio.ts'

import bytedanceIcon from '@lobehub/icons-static-svg/icons/bytedance-color.svg'
import fluxIcon from '@lobehub/icons-static-svg/icons/flux.svg'
import geminiIcon from '@lobehub/icons-static-svg/icons/gemini-color.svg'
import grokIcon from '@lobehub/icons-static-svg/icons/grok.svg'
import museIcon from '@lobehub/icons-static-svg/icons/muse-color.svg'
import nanoBananaIcon from '@lobehub/icons-static-svg/icons/nanobanana-color.svg'
import openAiIcon from '@lobehub/icons-static-svg/icons/openai.svg'
import {minimatch} from 'minimatch'

import {parseRatio} from '../ratio.ts'

/** the current values of a model’s controls, as they are about to be sent */
export type ModelControlValues = {
  aspectRatio?: string
  quality?: string
  resolution?: string
}
/** Receives an outgoing request body and returns the body that is actually sent. */
export type ModelHook = (body: Record<string, unknown>, controls: ModelControlValues) => Record<string, unknown>
export type ModelIcon = {
  /** drawn in the text color instead of its own colors */
  monochrome?: boolean
  /** URL of an SVG */
  url: string
}
export type ModelTraits = {
  /** values offered in the controls, replacing the catalog values of the same parameter */
  controls?: {
    quality?: ReadonlyArray<string>
    resolution?: ReadonlyArray<string>
  }
  hook?: ModelHook
  icon?: ModelIcon
  /** minimatch pattern of the model ID */
  pattern: string
  ratios?: ReadonlyArray<RatioString>
  title?: string
  /** the model maker */
  vendor?: string
}

const gptImageSizeStep = 16
const gptImageMaxEdge = 3840
const gptImageMaxPixels = 8_294_400
const gptImageTierPixels: Record<string, number> = {
  '1K': 1024 * 1024,
  '2K': 2048 * 2048,
  '4K': gptImageMaxPixels,
}
/**
 * the `WIDTHxHEIGHT` size of a GPT Image 2.5/2.6 model for an aspect and a resolution tier
 *
 * Both edges are multiples of 16, no edge exceeds 3840 px and the area stays at most 8,294,400 px, as the OpenAI Images API demands. The aspect itself must already lie between 1:3 and 3:1.
 */
export const getGptImageSize = (aspect: number, resolution: string) => {
  const pixels = gptImageTierPixels[resolution] ?? gptImageTierPixels['1K']
  const unclampedWidth = Math.sqrt(pixels * aspect)
  const unclampedHeight = unclampedWidth / aspect
  const scale = Math.min(1, gptImageMaxEdge / Math.max(unclampedWidth, unclampedHeight))
  const exactWidth = unclampedWidth * scale
  const exactHeight = unclampedHeight * scale
  const snap = (edge: number) => Math.max(gptImageSizeStep, Math.round(edge / gptImageSizeStep) * gptImageSizeStep)
  let width = snap(exactWidth)
  let height = snap(exactHeight)
  if (width * height > gptImageMaxPixels || Math.max(width, height) > gptImageMaxEdge) {
    width = Math.floor(exactWidth / gptImageSizeStep) * gptImageSizeStep
    height = Math.floor(exactHeight / gptImageSizeStep) * gptImageSizeStep
  }
  return `${width}x${height}`
}
/** a `WIDTHxHEIGHT` size whose shorter edge is 1024, for endpoints that only read a ratio from it */
export const getRatioSize = (aspect: number) => (aspect >= 1 ? `${Math.round(1024 * aspect)}x1024` : `1024x${Math.round(1024 / aspect)}`)
const omit = (body: Record<string, unknown>, keys: ReadonlyArray<string>) => Object.fromEntries(Object.entries(body).filter(([key]) => !keys.includes(key)))
/** OpenAI’s Images API takes the shape as one pixel size and rejects aspect_ratio and resolution. */
const gptImageSizeHook: ModelHook = (body, {aspectRatio, resolution}) => ({
  ...omit(body, ['aspect_ratio', 'resolution']),
  ...aspectRatio && resolution ? {size: getGptImageSize(parseRatio(aspectRatio), resolution)} : {},
})
/** Gemini’s thinking level is set through reasoning_effort, which CLIProxyAPI turns into thinkingConfig.thinkingLevel. */
const geminiThinkingHook: ModelHook = (body, {quality}) => ({
  ...omit(body, ['quality']),
  ...quality ? {reasoning_effort: quality} : {},
})
/** Muse Image only reads the shape from size and calls its effort reasoning_strength; it has a fixed pixel budget. */
const museImageHook: ModelHook = (body, {aspectRatio, quality}) => ({
  ...omit(body, ['aspect_ratio', 'resolution', 'quality']),
  ...aspectRatio ? {size: getRatioSize(parseRatio(aspectRatio))} : {},
  ...quality ? {reasoning_strength: quality} : {},
})

/**
 * what is known about models, keyed by minimatch patterns of the model ID
 *
 * Every matching entry applies; for each field, the earliest entry that sets it wins, so specific models come before their families. Vendor, title and icon always apply. Ratios and controls replace the catalog values only while ai_endpoint is set, because they describe what the endpoint is documented or tested to honor – CLIProxyAPI silently answers some catalog ratios with a square. The hook edits each request to the endpoint.
 */
export const modelTraits: ReadonlyArray<ModelTraits> = [
  {
    // Tested through CLIProxyAPI on 2026-11-13 at 1K: 13 ratios returned images; 16:9 hit quota. 1:8 and 8:1 differ by ~4%.
    pattern: '{,*/}gemini-3.1-flash-image',
    title: 'Gemini 3.1 Flash Image',
    ratios: ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'],
    // Thinking levels from CLIProxyAPI’s model registry; the catalog resolutions (512–4K) stay.
    controls: {quality: ['minimal', 'high']},
    hook: geminiThinkingHook,
  },
  {
    // Supported ratios, sizes and qualities as documented by OpenAI. Tested through CLIProxyAPI with ChatGPT OAuth on 2026-11-23: only the ratio written into the prompt is honored.
    pattern: '{,*/}gpt-image-2.6-sunburst',
    title: 'GPT Image 2.6 Sunburst',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '1:2', '2:1', '9:21', '21:9', '1:3', '3:1'],
    controls: {
      resolution: ['1K', '2K', '4K'],
      quality: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
    },
    hook: gptImageSizeHook,
  },
  {
    // Rechecked on 2026-11-13 against CLIProxyAPI: these nine ratios match exactly; 9:19.5, 19.5:9, 1:2 and 2:1 return 1024×1024.
    pattern: '{,*/}grok-imagine-image-2.0',
    title: 'Grok Imagine 2.0',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:20', '20:9'],
    // 1K and 2K tested on 2026-11-13. Quality tested on 2026-11-23: auto is billed and as fast as low, medium costs 1.5× and took 34 s instead of 5 s, high returns 400.
    controls: {
      resolution: ['1K', '2K'],
      quality: ['auto', 'low', 'medium'],
    },
  },
  {
    // Tested through CLIProxyAPI’s muse-image plugin on 2026-11-15: any ratio from 1:16 to 16:1 is honored at a fixed 2.56 MP, these exactly. reasoning_strength high (the default) refines over several passes, low returns after one.
    pattern: '{,*/}muse-image-1.0',
    title: 'Muse Image 1.0',
    ratios: ['1:16', '1:8', '1:4', '1:3', '9:21', '1:2', '9:16', '2:3', '5:7', '3:4', '4:5', '1:1', '5:4', '4:3', '7:5', '3:2', '16:9', '2:1', '21:9', '3:1', '4:1', '8:1', '16:1'],
    controls: {quality: ['low', 'high']},
    hook: museImageHook,
  },
  {
    pattern: '{,*/}gemini-nano-banana-*',
    icon: {url: nanoBananaIcon},
  },
  {
    pattern: '{,*/}gemini-*',
    vendor: 'Google',
    icon: {url: geminiIcon},
  },
  {
    pattern: '{,*/}gpt-image-*',
    vendor: 'OpenAI',
    icon: {
      url: openAiIcon,
      monochrome: true,
    },
  },
  {
    pattern: '{,*/}grok-imagine-*',
    vendor: 'xAI',
    icon: {
      url: grokIcon,
      monochrome: true,
    },
  },
  {
    pattern: '{,*/}flux-*',
    vendor: 'Black Forest Labs',
    icon: {
      url: fluxIcon,
      monochrome: true,
    },
  },
  {
    pattern: '{,*/}seedream-*',
    vendor: 'ByteDance',
    icon: {url: bytedanceIcon},
  },
  {
    pattern: '{,*/}muse-*',
    vendor: 'Meta',
    icon: {url: museIcon},
  },
]

const traitsCache = new Map<string, ModelTraits | undefined>
/** the merged traits of every entry matching the model ID, with the pattern of the most specific one */
export const findModelTraits = (modelId: string) => {
  if (traitsCache.has(modelId)) {
    return traitsCache.get(modelId)
  }
  const matching = modelTraits.filter(entry => minimatch(modelId, entry.pattern))
  const traits = matching.length ? Object.assign({}, ...matching.toReversed()) as ModelTraits : undefined
  traitsCache.set(modelId, traits)
  return traits
}
