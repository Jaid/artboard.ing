import type {Asset} from './assets.ts'
import type {Rect} from './geometry.ts'
import type {ImageRequest} from './imageApi.ts'
import type {ImageModel} from './models/index.ts'
import type {RatioString} from './ratio.ts'
import type {GenerationEvidence, IngredientEvidence, Job, JobTarget, Layer} from './state.ts'

import queryParameters from '#src/queryParameters.ts'

import {createIngredient, getLayer, getWorkspaceEpoch, withIngredient} from './actions.ts'
import {getApiKey, hasApiKey, requestApiKey} from './apiKey.ts'
import {assets} from './assets.ts'
import {frameHasContent, getUpstreamCanvasSize, renderRegion} from './composite.ts'
import {setContentAwareAlignment, supportsContentAwareAlignment} from './contentAware.ts'
import {createId} from './createId.ts'
import {createDemoImage} from './demo.ts'
import {getGenerationRegion} from './generationRegion.ts'
import {blobToDataUrl, encodeCanvas, prepareUpstreamImage} from './image.ts'
import {parseImageResult, readBoundedBody, validateImageRequest} from './imageApi.ts'
import {getModel} from './models/index.ts'
import {getErrorMessage, notify} from './notices.ts'
import {getOpenRouterHostTitle, openRouterOrigin} from './openRouterAccess.ts'
import {compilePrompt, findReferences} from './prompt.ts'
import {closestRatio, parseRatio} from './ratio.ts'
import {getRevisions, withAddedRevision} from './revisions.ts'
import {defaultGeneratedMask, editorStore, projectStore} from './state.ts'
import {findTransformPreset} from './transformPresets.ts'

export const emptyCanvasColor = queryParameters.transparent_color
/** image requests that may run at the same time: generations, rerolls and transforms together */
export const maxConcurrentGenerations = 32
export type GenerationOverrides = {
  frame?: Rect
  prompt?: string
}
export type ShotOptions = {
  /** the layer the results land in; retried shots pass the one their siblings already landed in */
  layerId?: string
  /** how many images to request; the shots dropdown decides when absent */
  shots?: number
}
export const renderFrameInput = (frame: Rect = editorStore.state.frame, maxSide?: number) => renderRegion({
  background: emptyCanvasColor,
  layers: projectStore.state.layers,
  region: frame,
  size: getUpstreamCanvasSize(frame, maxSide, maxSide === undefined ? undefined : Math.min(1024, maxSide)),
})
export function prepareGeneration(overrides: GenerationOverrides = {}) {
  const document = projectStore.state
  const model = getModel(editorStore.state.modelId)
  // An explicit frame (a retry) keeps its geometry; otherwise the frame, or all artwork while the frame is off, decides.
  const region = overrides.frame ? {
    frame: overrides.frame,
    ratio: closestRatio(overrides.frame.width / overrides.frame.height, model.aspectRatios),
  } : getGenerationRegion(editorStore.state, document.layers)
  const editor = {
    ...editorStore.state,
    ...overrides,
    frame: {...region.frame},
    ratio: region.ratio,
  }
  const mightHaveContent = frameHasContent(document.layers, editor.frame)
  const sample = mightHaveContent || findReferences(editor.prompt).some(token => token.index === 0) ? renderFrameInput(editor.frame) : undefined
  const hasCanvasContent = mightHaveContent && sample !== undefined && sample.emptyFraction < 1
  const compiled = compilePrompt({
    text: editor.prompt,
    hasCanvasContent,
    ingredientIndices: document.ingredients.map(item => item.index),
    maxReferences: model.maxReferences,
  })
  return {
    compiled,
    model,
    rendered: hasCanvasContent ? sample : undefined,
    editor,
    document,
  }
}
export const dismissJob = (id: string) => {
  editorStore.state.jobs.find(job => job.id === id)?.controller.abort()
  editorStore.set(state => ({
    ...state,
    jobs: state.jobs.filter(job => job.id !== id),
  }))
}

/** everything a request needs, captured before anything is encoded or sent */
type GenerationTask = {
  /** the canvas inside the frame, freshly rendered or – for rerolls – the exact image the first shot was sent */
  canvas?: {
    assetId: string
  } | {
    canvas: OffscreenCanvas
  }
  capturedAt: number
  compiledPrompt: string
  demoMode: boolean
  /** where the result lands: a new layer or revision in the captured frame, or a new collection item */
  destination: JobTarget
  epoch: number
  model: ImageModel
  /** name of the result; derived from the prompt when absent */
  name?: string
  prompt: string
  quality: string
  ratio: RatioString
  /** referenced collection images in prompt order */
  referenceAssetIds: ReadonlyArray<string>
  resolution: string
  /** distinguishes the procedural demo images of rerolls; each further shot adds one */
  variation?: number
}
/** the input images of a task, encoded once and shared by all of its shots */
type PreparedInputs = {
  canvasAsset?: Asset
  /** the first referenced collection image, which a demo transform starts from */
  firstIngredientAsset?: Asset
  /** the images actually sent for the referenced collection images */
  referenceAssetIds: Array<string>
  request: ImageRequest
}

/** Checks credentials and concurrency; resolves how many of the shots may be sent, 0 if none. */
const ensureDispatchable = (task: GenerationTask, shots: number) => {
  if (task.epoch !== getWorkspaceEpoch()) {
    return 0
  }
  if (!task.demoMode && !queryParameters.ai_endpoint && !hasApiKey()) {
    requestApiKey()
    const advice = queryParameters.openrouter_host === openRouterOrigin ? 'Enter your OpenRouter key.' : `Enter a key for ${getOpenRouterHostTitle(queryParameters.openrouter_host)}, or open the page with ?openrouter_key=false if it adds its own.`
    notify('info', `${advice} Demo mode does not need a key.`)
    return 0
  }
  const free = maxConcurrentGenerations - editorStore.state.jobs.filter(job => job.status === 'running').length
  if (free <= 0) {
    notify('info', `${maxConcurrentGenerations} generations are already running.`)
    return 0
  }
  if (free < shots) {
    notify('info', `Only ${free} of ${shots} shots were started, because at most ${maxConcurrentGenerations} generations run at once.`)
  }
  return Math.min(shots, free)
}

/**
 * Snapshot first, encode second, send last. Store mutations during a request cannot change its inputs or placement.
 * Every shot sends the very same request, and all of them land in one layer as its revisions.
 */
export async function generate(overrides: GenerationOverrides = {}, {layerId = createId(), shots = editorStore.state.shots}: ShotOptions = {}) {
  const epoch = getWorkspaceEpoch()
  const capturedAt = Date.now()
  let prepared: ReturnType<typeof prepareGeneration>
  try {
    prepared = prepareGeneration(overrides)
  } catch (error) {
    notify('error', getErrorMessage(error))
    return
  }
  if (prepared.compiled.errors.length) {
    notify('error', prepared.compiled.errors.join(' '))
    return
  }
  const {editor, document, compiled, rendered, model} = prepared
  const referenceAssetIds: Array<string> = []
  for (const source of compiled.sources) {
    if (source.kind !== 'ingredient') {
      continue
    }
    const ingredient = document.ingredients.find(item => item.index === source.index)
    if (!ingredient) {
      notify('error', 'A prompt ingredient is missing.')
      return
    }
    referenceAssetIds.push(ingredient.assetId)
  }
  await runGeneration({
    epoch,
    capturedAt,
    model,
    demoMode: editor.demoMode,
    destination: {
      target: 'canvas',
      rect: editor.frame,
      layerId,
    },
    ratio: editor.ratio,
    resolution: editor.resolution,
    quality: editor.quality,
    prompt: editor.prompt,
    compiledPrompt: compiled.text,
    canvas: rendered ? {canvas: rendered.canvas} : undefined,
    referenceAssetIds,
  }, shots)
}

/**
 * Sends the request of a generated layer again: the same prompt and the very same input images, but the currently selected model and model settings.
 * Each shot becomes a further revision of that layer.
 */
export async function reroll(layerId: string, shots = editorStore.state.shots) {
  const epoch = getWorkspaceEpoch()
  const capturedAt = Date.now()
  const layer = getLayer(layerId)
  const evidence = layer?.evidence
  if (layer?.kind !== 'generated' || !evidence) {
    notify('error', 'Only generations can be rerolled.')
    return
  }
  const model = getModel(editorStore.state.modelId)
  const inputIds = [...evidence.canvasAssetId ? [evidence.canvasAssetId] : [], ...evidence.referenceAssetIds]
  if (inputIds.some(id => !assets.has(id))) {
    notify('error', 'The captured input images of this generation are unavailable.')
    return
  }
  if (inputIds.length > model.maxReferences) {
    notify('error', `${model.title} accepts at most ${model.maxReferences} input images, but this generation used ${inputIds.length}. Choose another model to reroll it.`)
    return
  }
  const {demoMode, resolution, quality} = editorStore.state
  await runGeneration({
    epoch,
    capturedAt,
    model,
    demoMode,
    destination: {
      target: 'canvas',
      rect: {...layer.rect},
      layerId,
    },
    ratio: closestRatio(layer.rect.width / layer.rect.height, model.aspectRatios),
    resolution: model.normalizeResolution(resolution),
    quality: model.normalizeQuality(quality) ?? '',
    prompt: evidence.prompt,
    compiledPrompt: evidence.compiledPrompt,
    canvas: evidence.canvasAssetId ? {assetId: evidence.canvasAssetId} : undefined,
    referenceAssetIds: evidence.referenceAssetIds,
    variation: getRevisions(layer).length,
  }, shots)
}

/**
 * Applies a transform preset to a collection image. The prompt input plays no part: the preset’s instruction is sent with the image as the only input image.
 * The currently selected model, resolution, quality and ratio are used, and the result becomes a new collection item.
 */
export async function transformIngredient(ingredientId: string, presetId: string) {
  const epoch = getWorkspaceEpoch()
  const capturedAt = Date.now()
  const preset = findTransformPreset(presetId)
  const ingredient = projectStore.state.ingredients.find(item => item.id === ingredientId)
  if (!preset || !ingredient) {
    notify('error', 'This collection item or transform no longer exists.')
    return
  }
  if (!assets.has(ingredient.assetId)) {
    notify('error', 'The image of this collection item is unavailable.')
    return
  }
  const model = getModel(editorStore.state.modelId)
  if (model.maxReferences < 1) {
    notify('error', `${model.title} does not accept input images. Choose another model to transform images.`)
    return
  }
  const {demoMode, resolution, quality} = editorStore.state
  const ratio = model.supportsRatio(editorStore.state.ratio) ? editorStore.state.ratio : closestRatio(parseRatio(editorStore.state.ratio), model.aspectRatios)
  await runGeneration({
    epoch,
    capturedAt,
    model,
    demoMode,
    destination: {
      target: 'collection',
      presetId: preset.id,
      ratio,
      sourceIngredientId: ingredient.id,
    },
    ratio,
    resolution: model.normalizeResolution(resolution),
    quality: model.normalizeQuality(quality) ?? '',
    name: `${preset.title} · ${ingredient.name}`,
    prompt: preset.prompt,
    compiledPrompt: preset.prompt,
    referenceAssetIds: [ingredient.assetId],
  })
}

/** Sends the shots of a task, at most as many as may still run at once. Their input images are prepared only once. */
async function runGeneration(task: GenerationTask, shots = 1) {
  const count = ensureDispatchable(task, shots)
  if (!count) {
    return
  }
  const jobs = Array.from({length: count}, (): Job => ({
    id: createId(),
    controller: new AbortController,
    modelId: task.model.id,
    prompt: task.prompt,
    startedAt: Date.now(),
    status: 'running',
    ...task.destination,
  }))
  const signals = jobs.map(job => AbortSignal.any([job.controller.signal, AbortSignal.timeout(240_000)]))
  editorStore.set(state => ({
    ...state,
    jobs: [...state.jobs, ...jobs],
  }))
  const releases: Array<() => void> = []
  try {
    const inputs = await prepareInputs(task, releases)
    await Promise.all(jobs.map((job, shot) => runShot(task, inputs, job, signals[shot], shot)))
  } catch (error) {
    // Without input images, no shot can be sent.
    for (const [shot, job] of jobs.entries()) {
      failJob(task, job, signals[shot], error)
    }
  } finally {
    for (const release of releases) {
      release()
    }
  }
}
/** Encodes the captured canvas and the referenced collection images and builds the request. Every image stays pinned until the releases run. */
async function prepareInputs(task: GenerationTask, releases: Array<() => void>): Promise<PreparedInputs> {
  const ingredientAssets = task.referenceAssetIds.map(id => assets.require(id))
  const capturedCanvas = task.canvas && 'assetId' in task.canvas ? assets.require(task.canvas.assetId) : undefined
  releases.push(assets.pin([...ingredientAssets.map(asset => asset.id), ...capturedCanvas ? [capturedCanvas.id] : []]))
  let canvasAsset: Asset | undefined
  const referenceAssetIds: Array<string> = []
  const input_references: Array<{
    image_url: {url: string}
    type: 'image_url'
  }> = []
  if (task.canvas) {
    canvasAsset = 'canvas' in task.canvas ? await assets.add(await encodeCanvas(task.canvas.canvas, 'webp', 0.98)) : capturedCanvas!
    releases.push(assets.pin([canvasAsset.id]))
    input_references.push({
      type: 'image_url',
      image_url: {url: await blobToDataUrl(canvasAsset.blob)},
    })
  }
  for (const source of ingredientAssets) {
    const image = await prepareUpstreamImage(source.blob, source)
    const sent = image.blob === source.blob ? source : await assets.add(image.blob)
    releases.push(assets.pin([sent.id]))
    referenceAssetIds.push(sent.id)
    input_references.push({
      type: 'image_url',
      image_url: {url: image.dataUrl},
    })
  }
  const request = validateImageRequest({
    model: task.model.id,
    prompt: task.compiledPrompt,
    aspect_ratio: task.ratio,
    ...task.model.getRequestOptions({
      resolution: task.resolution,
      quality: task.quality,
    }),
    input_references,
  })
  return {
    canvasAsset,
    firstIngredientAsset: ingredientAssets[0],
    referenceAssetIds,
    request,
  }
}
/** A job that ended without a result is marked as failed, unless it was canceled or belongs to a replaced workspace, which drops it silently. */
function failJob(task: GenerationTask, job: Job, signal: AbortSignal, error: unknown) {
  if (task.epoch !== getWorkspaceEpoch() || job.controller.signal.aborted) {
    editorStore.set(state => ({
      ...state,
      jobs: state.jobs.filter(item => item.id !== job.id),
    }))
    return
  }
  const nothingAdded = job.target === 'canvas' ? 'No layer was added.' : 'No collection item was added.'
  editorStore.set(state => ({
    ...state,
    jobs: state.jobs.map(item => (item.id === job.id ? {
      ...item,
      status: 'failed' as const,
      error: signal.aborted ? `Generation timed out. ${nothingAdded}` : getErrorMessage(error),
    } : item)),
  }))
}
/** Sends one shot and lands its result. Failures end up in its job; it never throws. */
async function runShot(task: GenerationTask, inputs: PreparedInputs, job: Job, signal: AbortSignal, shot: number) {
  const {model, epoch} = task
  // A canvas result is fitted into its frame, while a collection item simply is what the provider returns.
  const requestedAspect = job.target === 'canvas' ? job.rect.width / job.rect.height : parseRatio(job.ratio)
  const nothingAdded = job.target === 'canvas' ? 'No layer was added.' : 'No collection item was added.'
  const releases: Array<() => void> = []
  let cost: number | undefined
  const current = () => epoch === getWorkspaceEpoch() && !job.controller.signal.aborted
  try {
    signal.throwIfAborted()
    let blob: Blob
    if (task.demoMode) {
      const source = task.canvas && 'canvas' in task.canvas ? task.canvas.canvas : inputs.canvasAsset?.bitmap ?? (job.target === 'collection' ? inputs.firstIngredientAsset?.bitmap : undefined)
      blob = await createDemoImage(task.prompt, requestedAspect, source, signal, (task.variation ?? 0) + shot)
    } else if (queryParameters.ai_endpoint) {
      // Loaded on demand so the AI SDK stays out of the main bundle. A browser-session key, if entered, is sent as bearer token.
      const {generateWithAiEndpoint} = await import('./aiEndpoint.ts')
      blob = await generateWithAiEndpoint({
        endpoint: queryParameters.ai_endpoint,
        key: getApiKey() || undefined,
        model,
        request: inputs.request,
        signal,
      })
    } else {
      // Without a key (?openrouter_key=false), the host adds its own.
      const key = getApiKey()
      const response = await fetch(`${queryParameters.openrouter_host}/api/v1/images`, {
        method: 'POST',
        signal,
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...key ? {Authorization: `Bearer ${key}`} : {},
        },
        body: JSON.stringify(inputs.request),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`Image API request failed (HTTP ${response.status}). Check your key, credit balance and selected model. ${nothingAdded}`)
      }
      const bytes = await readBoundedBody(response, 64_000_000, signal)
      const result = parseImageResult(JSON.parse((new TextDecoder).decode(bytes)))
      cost = result.usage.cost
      blob = new Blob([Uint8Array.fromBase64(result.data[0].b64_json)], {type: result.data[0].media_type})
    }
    signal.throwIfAborted()
    if (!current()) {
      return
    }
    const raw = await assets.add(blob)
    releases.push(assets.pin([raw.id]))
    const actualAspect = raw.width / raw.height
    if (job.target === 'canvas' && Math.abs(Math.log(actualAspect / requestedAspect)) > 0.02) {
      notify('info', 'The provider returned a different aspect ratio. It is fitted into the captured frame; the raw output remains in the project.')
    }
    const name = `${task.demoMode ? 'Demo · ' : ''}${(task.name ?? task.prompt.trim().split('\n')[0]).slice(0, 72)}`
    const capture: IngredientEvidence = {
      id: job.id,
      capturedAt: task.capturedAt,
      modelId: model.id,
      ratio: task.ratio,
      resolution: task.resolution,
      quality: task.quality,
      prompt: task.prompt,
      compiledPrompt: task.compiledPrompt,
      canvasAssetId: inputs.canvasAsset?.id,
      referenceAssetIds: inputs.referenceAssetIds,
      outputAssetId: raw.id,
      cost,
      demo: task.demoMode,
    }
    const ingredient = await createIngredient(raw, name, 'generated')
    if (!current()) {
      return
    }
    // The collection entry keeps the capture as well, so it outlives the layer and also exists for transforms.
    if (job.target === 'collection') {
      projectStore.commit(state => withIngredient(state, {
        ...ingredient,
        evidence: capture,
      }))
      editorStore.set(state => ({
        ...state,
        jobs: state.jobs.filter(item => item.id !== job.id),
      }))
      return
    }
    const evidence: GenerationEvidence = {
      ...capture,
      frame: job.rect,
    }
    // The first shot to finish creates the layer, every other one becomes a revision of it. A rerolled layer that was deleted in the meantime comes back with this shot.
    const existed = Boolean(getLayer(job.layerId))
    projectStore.commit(state => withIngredient({
      ...state,
      layers: existed ? state.layers.map(item => (item.id === job.layerId ? withAddedRevision(item, {
        assetId: raw.id,
        evidence,
        modelId: model.id,
      }) : item)) : [...state.layers, {
        ...defaultGeneratedMask,
        id: job.layerId,
        assetId: raw.id,
        kind: 'generated',
        name,
        rect: job.rect,
        visible: true,
        createdAt: Date.now(),
        modelId: model.id,
        evidence,
      } satisfies Layer],
    }, {
      ...ingredient,
      evidence,
    }))
    editorStore.set(state => ({
      ...state,
      jobs: state.jobs.filter(item => item.id !== job.id),
    }))
    const updated = existed && getLayer(job.layerId)
    if (updated && updated.contentAware && supportsContentAwareAlignment(updated)) {
      void setContentAwareAlignment(updated.id, true)
    }
  } catch (error) {
    failJob(task, job, signal, error)
  } finally {
    for (const release of releases) {
      release()
    }
    if (cost !== undefined) {
      const billed = cost
      editorStore.set(state => ({
        ...state,
        sessionCost: state.sessionCost + billed,
      }))
    }
  }
}
