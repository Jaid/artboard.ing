import type {RatioString} from '../ratio.ts'
import type {ModelIcon, ModelTraits} from './modelTraits.ts'

import queryParameters, {customModelIds} from '#src/queryParameters.ts'

import {isRatioString} from '../ratio.ts'
import {Store} from '../store/index.ts'
import {ImageModel} from './base/ImageModel.ts'
import snapshot from './catalog.json'
import {findModelTraits} from './modelTraits.ts'

export type Capability = {
  max: number
  min: number
  type: 'range'
} | {type: 'boolean'} | {
  type: 'enum'
  values: Array<string>
}
export type ImageCatalogEntry = {
  id: string
  name: string
  supported_parameters: Record<string, Capability>
}
export const requestedModelIds: ReadonlyArray<string> = snapshot.data.map(row => row.id)
const titles = ['Gemini Flash Lite', 'Gemini Flash', 'Nano Banana 2.1', 'GPT Image Sunburst', 'Flux 3', 'Grok Imagine', 'Seedream Flash', 'Seedream Lite', 'Seedream Pro']
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Treat discovery data as untrusted. Absence in this catalog is not a claim about account access. */
export function parseImageCatalog(value: unknown): Array<ImageCatalogEntry> {
  if (!record(value) || !Array.isArray(value.data)) {
    throw new Error('Invalid Image API model catalog.')
  }
  const entries: Array<ImageCatalogEntry> = []
  for (const row of value.data) {
    if (!record(row) || typeof row.id !== 'string' || !requestedModelIds.includes(row.id) || !record(row.supported_parameters)) {
      continue
    }
    const supported_parameters: Record<string, Capability> = {}
    for (const [key, cap] of Object.entries(row.supported_parameters)) {
      if (!record(cap)) {
        continue
      }
      if (cap.type === 'enum' && Array.isArray(cap.values) && cap.values.every(v => typeof v === 'string')) {
        supported_parameters[key] = {
          type: 'enum',
          values: cap.values,
        }
      } else if (cap.type === 'range' && typeof cap.min === 'number' && typeof cap.max === 'number' && Number.isFinite(cap.min) && Number.isFinite(cap.max) && cap.max >= cap.min) {
        supported_parameters[key] = {
          type: 'range',
          min: cap.min,
          max: cap.max,
        }
      } else if (cap.type === 'boolean') {
        supported_parameters[key] = {type: 'boolean'}
      }
    }
    const ratio = supported_parameters.aspect_ratio as Capability | undefined
    if (ratio?.type !== 'enum' || !ratio.values.some(isRatioString)) {
      continue
    }
    entries.push({
      id: row.id,
      name: typeof row.name === 'string' ? row.name : row.id,
      supported_parameters,
    })
  }
  if (!entries.length) {
    throw new Error('The Image API catalog contains none of the requested models.')
  }
  return entries
}

let catalog = new Map(parseImageCatalog(snapshot).map(row => [row.id, row]))
export const catalogStore = new Store({
  source: 'snapshot',
  updatedAt: snapshot.retrievedAt,
  error: '',
  revision: 0,
})
const values = (id: string, key: string) => {
  const cap = catalog.get(id)?.supported_parameters[key]
  return cap?.type === 'enum' ? cap.values : []
}
/** vendor, title and icon of a model apply everywhere */
const getTraits = (model: ImageModel): ModelTraits | undefined => findModelTraits(model.shortId)
/** ratios, controls and hooks only describe what ai_endpoint serves, so they are ignored for OpenRouter */
const getEndpointTraits = (model: ImageModel) => (queryParameters.ai_endpoint ? getTraits(model) : undefined)
class CatalogImageModel extends ImageModel {
  constructor(readonly id: string, readonly catalogTitle: string) {
    super()
  }
  get aspectRatios(): ReadonlyArray<RatioString> {
    return getEndpointTraits(this)?.ratios ?? values(this.id, 'aspect_ratio').filter(isRatioString)
  }
  get icon(): ModelIcon | undefined {
    return getTraits(this)?.icon
  }
  get maxReferences() {
    const cap = catalog.get(this.id)?.supported_parameters.input_references
    return cap?.type === 'range' ? Math.max(0, Math.floor(cap.max)) : 0
  }
  get note() {
    return `${catalogStore.state.source === 'live' ? 'Live Image API' : 'Bundled capability snapshot'} · up to ${this.maxReferences} reference images`
  }
  get qualities(): ReadonlyArray<string> {
    return getEndpointTraits(this)?.controls?.quality ?? values(this.id, 'quality')
  }
  get resolutions(): ReadonlyArray<string> {
    return getEndpointTraits(this)?.controls?.resolution ?? values(this.id, 'resolution')
  }
  get title(): string {
    return getTraits(this)?.title ?? this.catalogTitle
  }
  get vendor(): string {
    return getTraits(this)?.vendor ?? this.id.split('/')[0]
  }
}
const catalogModels: ReadonlyArray<ImageModel> = requestedModelIds.map((id, i) => new CatalogImageModel(id, titles[i]))
const defaultCustomRatios: ReadonlyArray<RatioString> = ['1:1', '3:4', '4:3', '9:16', '16:9']
/** a model given by a model_id query parameter or a models ID the catalog lacks; capabilities come from a catalog model with the same ID, if there is one */
class CustomImageModel extends ImageModel {
  constructor(readonly id: string, readonly base?: ImageModel) {
    super()
  }
  get aspectRatios(): ReadonlyArray<RatioString> {
    if (queryParameters.ratios.length) {
      return queryParameters.ratios
    }
    return getEndpointTraits(this)?.ratios ?? this.base?.aspectRatios ?? defaultCustomRatios
  }
  get icon(): ModelIcon | undefined {
    return getTraits(this)?.icon
  }
  get maxReferences() {
    return this.base?.maxReferences ?? 16
  }
  get note() {
    return `Custom model from the URL · up to ${this.maxReferences} reference images`
  }
  get qualities(): ReadonlyArray<string> {
    return getEndpointTraits(this)?.controls?.quality ?? this.base?.qualities ?? []
  }
  get resolutions(): ReadonlyArray<string> {
    return getEndpointTraits(this)?.controls?.resolution ?? this.base?.resolutions ?? []
  }
  /** sent as is, even if it contains a slash */
  override get shortId() {
    return this.id
  }
  get title(): string {
    return getTraits(this)?.title ?? this.id
  }
  get vendor(): string {
    return getTraits(this)?.vendor ?? 'Custom'
  }
}
const matchesId = (model: ImageModel, id: string) => model.id === id || model.shortId === id
const findIn = (candidates: ReadonlyArray<ImageModel>, id: string) => candidates.find(model => matchesId(model, id))
/** IDs from the models parameter that the catalog lacks become custom models, just like model_id */
const listedCustomIds = queryParameters.models.filter(id => !findIn(catalogModels, id))
export const customModels: ReadonlyArray<ImageModel> = [...new Set([...customModelIds, ...listedCustomIds])].map(id => new CustomImageModel(id, findIn(catalogModels, id)))
/**
 * Limits the available models to the listed IDs, in their order, after the model_id models.
 *
 * Without listed IDs, every model is available. Earlier models win over later ones that share an ID.
 */
export const pickListedModels = (available: ReadonlyArray<ImageModel>, listedIds: ReadonlyArray<string>, pinned: ReadonlyArray<ImageModel> = []) => {
  if (!listedIds.length) {
    return available
  }
  const listed = listedIds.map(id => findIn(available, id)).filter(model => model !== undefined)
  return [...new Set([...pinned, ...listed])]
}
/** custom models come first, so they win over a catalog model whose short ID they share */
export const models: ReadonlyArray<ImageModel> = pickListedModels([...customModels, ...catalogModels], queryParameters.models, customModels.filter(model => customModelIds.includes(model.id)))
export const defaultModelId = 'google/gemini-nano-banana-2.1'
export const defaultModel = (queryParameters.models.length ? models[0] : customModels.at(0)) ?? models.find(model => model.id === defaultModelId) ?? models[0]
export const findModel = (id: unknown) => (typeof id === 'string' ? findIn(models, id.trim()) : undefined)
export const getModel = (id: unknown): ImageModel => findModel(id) ?? defaultModel
/** title and icon of any model ID, also one that is no longer offered, like a model of an earlier generation that the models parameter now leaves out */
export const describeModel = (id: string): Pick<ImageModel, 'icon' | 'title'> => {
  const model = findIn([...customModels, ...catalogModels], id)
  if (model) {
    return model
  }
  const traits = findModelTraits(id)
  return {
    title: traits?.title ?? id,
    icon: traits?.icon,
  }
}
export function applyImageCatalog(value: unknown) {
  const entries = parseImageCatalog(value)
  // Retain explicitly labeled snapshot records for models temporarily missing from discovery.
  catalog = new Map([...catalog, ...entries.map(row => [row.id, row] as const)])
  catalogStore.set(state => ({
    source: 'live',
    updatedAt: (new Date).toISOString(),
    error: entries.length < catalogModels.length ? 'Some models are using bundled capabilities.' : '',
    revision: state.revision + 1,
  }))
}
export async function refreshImageCatalog() {
  try {
    const response = await fetch(`${queryParameters.openrouter_host}/api/v1/images/models`, {signal: AbortSignal.timeout(12_000)})
    if (!response.ok) {
      throw new Error(`Image catalog returned HTTP ${response.status}.`)
    }
    applyImageCatalog(await response.json())
  } catch {
    catalogStore.set({error: 'Live discovery is unavailable; using the dated capability snapshot.'})
  }
}

export type {GenerationSettings} from './base/ImageModel.ts'

export {ImageModel} from './base/ImageModel.ts'
