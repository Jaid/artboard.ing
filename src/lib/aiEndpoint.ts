import type {ImageRequest} from './imageApi.ts'
import type {ImageModel} from './models/index.ts'
import type {ModelControlValues, ModelHook} from './models/modelTraits.ts'
import type {ImageModelV4, ImageModelV4CallOptions, ImageModelV4File, ImageModelV4Result} from '@ai-sdk/provider'

import {generateImage} from 'ai'

import {findModelTraits} from './models/modelTraits.ts'
import {getPromptPartsFactory} from './promptParts.ts'

type JsonRecord = Record<string, unknown>
type ImageEndpointResponse = {data?: Array<{
  b64_json?: unknown
  revised_prompt?: unknown
  url?: unknown
}>}
type ChatEndpointResponse = {choices?: Array<{message?: {images?: Array<{image_url?: {url?: unknown}}>}}>}

/** key of the AI SDK provider options that are passed through as request body fields */
export const aiEndpointProvider = 'ai-endpoint'
const errorBodyMaxCharacters = 300

/** Accepts “http://127.0.0.1:8317/v1” as well as “http://127.0.0.1:8317”, which gets “/v1” appended. */
export const normalizeAiEndpoint = (endpoint: string) => {
  let url: URL
  try {
    url = new URL(endpoint.trim())
  } catch {
    throw new Error(`ai_endpoint “${endpoint}” is not a valid URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`ai_endpoint “${endpoint}” must use HTTP or HTTPS.`)
  }
  if (url.pathname === '/') {
    url.pathname = '/v1'
  }
  return url.href.replace(/\/+$/u, '')
}
const assertOk = async (response: Response, title: string) => {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${title} failed (HTTP ${response.status})${text ? `: ${text.slice(0, errorBodyMaxCharacters)}` : '.'} No layer was added.`)
  }
}
const toDataUrl = (file: ImageModelV4File) => {
  if (file.type === 'url') {
    return file.url
  }
  return `data:${file.mediaType};base64,${typeof file.data === 'string' ? file.data : file.data.toBase64()}`
}
const toBlob = async (file: ImageModelV4File, signal?: AbortSignal) => {
  if (file.type === 'url') {
    const response = await fetch(file.url, {signal})
    return response.blob()
  }
  const bytes = typeof file.data === 'string' ? Uint8Array.fromBase64(file.data) : file.data
  return new Blob([bytes as Uint8Array<ArrayBuffer>], {type: file.mediaType})
}
const downloadImage = async (url: string, baseUrl: string, title: string, signal?: AbortSignal) => {
  const response = await fetch(new URL(url, `${baseUrl}/`), {signal})
  await assertOk(response, `${title} download`)
  return new Uint8Array(await response.arrayBuffer())
}
const createResult = (modelId: string, image: Uint8Array | string, revisedPrompt?: string): ImageModelV4Result => ({
  images: typeof image === 'string' ? [image] : [image],
  warnings: [],
  providerMetadata: {
    [aiEndpointProvider]: {
      images: [revisedPrompt ? {revisedPrompt} : {}],
    },
  },
  response: {
    timestamp: new Date,
    modelId,
    headers: undefined,
  },
})
/** GPT image models behind CLIProxyAPI ignore aspect_ratio and size; without input images, they only follow a ratio written into the prompt */
const withPromptRatio = (modelId: string, prompt: string, aspectRatio?: string) => {
  if (!aspectRatio || !modelId.startsWith('gpt-')) {
    return prompt
  }
  const [width, height] = aspectRatio.split(':').map(Number)
  let orientation = 'square'
  if (width !== height) {
    orientation = width > height ? 'landscape' : 'portrait'
  }
  return `${prompt}\n\nAspect ratio: ${aspectRatio} (${orientation})`
}
const getBodyOptions = (options: ImageModelV4CallOptions) => (options.providerOptions[aiEndpointProvider] ?? {}) as JsonRecord
const getControlValues = (options: ImageModelV4CallOptions): ModelControlValues => {
  const {quality, resolution} = getBodyOptions(options)
  return {
    aspectRatio: options.aspectRatio,
    quality: typeof quality === 'string' ? quality : undefined,
    resolution: typeof resolution === 'string' ? resolution : undefined,
  }
}
const passThrough: ModelHook = body => body
type EndpointModelConfig = {
  baseUrl: string
  headers: Record<string, string>
  hook?: ModelHook
  modelId: string
}
/** OpenAI-style images endpoint: /images/generations for plain prompts, /images/edits once input images are attached */
const createImagesEndpointModel = ({baseUrl, headers, hook = passThrough, modelId}: EndpointModelConfig): ImageModelV4 => ({
  specificationVersion: 'v4',
  provider: aiEndpointProvider,
  modelId,
  maxImagesPerCall: 1,
  doGenerate: async options => {
    const title = `${modelId} image generation`
    const {abortSignal, aspectRatio, files = [], prompt = ''} = options
    const fields = hook({
      model: modelId,
      // With input images attached, the output already follows their shape.
      prompt: files.length ? prompt : withPromptRatio(modelId, prompt, aspectRatio),
      n: 1,
      response_format: 'b64_json',
      ...aspectRatio ? {aspect_ratio: aspectRatio} : {},
      ...getBodyOptions(options),
    }, getControlValues(options))
    let response: Response
    if (files.length) {
      const form = new FormData
      for (const [key, value] of Object.entries(fields)) {
        form.set(key, String(value))
      }
      for (const [index, file] of files.entries()) {
        const blob = await toBlob(file, abortSignal)
        form.append('image', blob, `image-${index}.${blob.type.split('/')[1] ?? 'png'}`)
      }
      response = await fetch(`${baseUrl}/images/edits`, {
        method: 'POST',
        signal: abortSignal,
        headers,
        body: form,
      })
    } else {
      response = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        signal: abortSignal,
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(fields),
      })
    }
    await assertOk(response, title)
    if (response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
      return createResult(modelId, new Uint8Array(await response.arrayBuffer()))
    }
    const json = await response.json() as ImageEndpointResponse
    const image = json.data?.[0]
    const revisedPrompt = typeof image?.revised_prompt === 'string' ? image.revised_prompt : undefined
    if (typeof image?.b64_json === 'string' && image.b64_json.length > 0) {
      return createResult(modelId, image.b64_json, revisedPrompt)
    }
    if (typeof image?.url === 'string' && image.url.length > 0) {
      return createResult(modelId, await downloadImage(image.url, baseUrl, title, abortSignal), revisedPrompt)
    }
    throw new Error(`${title} returned no image. No layer was added.`)
  },
})
/** chat completion endpoint that returns generated images in message.images, used for Gemini image models */
const createChatImageModel = ({baseUrl, headers, hook = passThrough, modelId}: EndpointModelConfig): ImageModelV4 => ({
  specificationVersion: 'v4',
  provider: aiEndpointProvider,
  modelId,
  maxImagesPerCall: 1,
  doGenerate: async options => {
    const title = `${modelId} image generation`
    const {abortSignal, aspectRatio, files = [], prompt = ''} = options
    const {resolution, ...body} = getBodyOptions(options)
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: abortSignal,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(hook({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: getPromptPartsFactory(modelId)(prompt, files).map(part => (part.type === 'text' ? part : {
              type: 'image_url',
              image_url: {url: toDataUrl(part.image)},
            })),
          },
        ],
        modalities: ['image', 'text'],
        image_config: {
          ...aspectRatio ? {aspect_ratio: aspectRatio} : {},
          ...resolution ? {image_size: resolution} : {},
        },
        ...body,
      }, getControlValues(options))),
    })
    await assertOk(response, title)
    const json = await response.json() as ChatEndpointResponse
    const imageUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url
    if (typeof imageUrl !== 'string' || imageUrl.length === 0) {
      throw new Error(`${title} returned no image. No layer was added.`)
    }
    const match = /^data:[^,]*;base64,(.+)$/su.exec(imageUrl)
    if (match) {
      return createResult(modelId, match[1])
    }
    return createResult(modelId, await downloadImage(imageUrl, baseUrl, title, abortSignal))
  },
})

/**
 * an AI SDK image model for an OpenAI-compatible endpoint like CLIProxyAPI
 *
 * The endpoint receives the model ID without its vendor prefix, so “x-ai/grok-imagine-image-2.0” is requested as “grok-imagine-image-2.0”. Gemini models are served through chat completions, all others through the images endpoints. The hook from the model’s traits gets the last word on every request body.
 */
export const createAiEndpointModel = ({endpoint, key, model}: {
  endpoint: string
  key?: string
  model: ImageModel
}): ImageModelV4 => {
  const config: EndpointModelConfig = {
    baseUrl: normalizeAiEndpoint(endpoint),
    headers: key ? {authorization: `Bearer ${key}`} : {},
    hook: findModelTraits(model.shortId)?.hook,
    modelId: model.shortId,
  }
  return /gemini/i.test(model.id) ? createChatImageModel(config) : createImagesEndpointModel(config)
}

/** Sends an already validated Image API request through the AI SDK instead of OpenRouter. */
export async function generateWithAiEndpoint({endpoint, key, model, request, signal}: {
  endpoint: string
  key?: string
  model: ImageModel
  request: ImageRequest
  signal?: AbortSignal
}) {
  const images = request.input_references.map(ref => Uint8Array.fromBase64(ref.image_url.url.slice(ref.image_url.url.indexOf(',') + 1)))
  const bodyOptions: Record<string, string> = {}
  if (request.resolution) {
    bodyOptions.resolution = request.resolution
  }
  if (request.quality) {
    bodyOptions.quality = request.quality
  }
  const {image} = await generateImage({
    model: createAiEndpointModel({
      endpoint,
      key,
      model,
    }),
    prompt: images.length ? {
      text: request.prompt,
      images,
    } : request.prompt,
    aspectRatio: request.aspect_ratio as `${number}:${number}`,
    providerOptions: {[aiEndpointProvider]: bodyOptions},
    maxRetries: 0,
    abortSignal: signal,
  })
  return new Blob([image.uint8Array as Uint8Array<ArrayBuffer>], {type: image.mediaType})
}
