import type {Rect} from '#src/lib/geometry.ts'
import type {GenerationEvidence, Ingredient, Layer, ProjectDocument} from '#src/lib/state.ts'

import {projectStore} from '#src/lib/state.ts'

export const createRect = (width = 100, height = 100, x = 0, y = 0): Rect => ({
  x,
  y,
  width,
  height,
})

/** a visible, unmasked imported layer whose asset id is derived from its id */
export const createLayer = (id: string, extra: Partial<Layer> = {}): Layer => ({
  id,
  assetId: `asset-${id}`,
  name: id,
  kind: 'import',
  createdAt: 0,
  visible: true,
  area: 1,
  feather: 0,
  rect: createRect(),
  ...extra,
})

export const createIngredient = (index: number, extra: Partial<Ingredient> = {}): Ingredient => ({
  id: `ingredient-${index}`,
  assetId: `asset-${index}`,
  index,
  name: `Image ${index}`,
  kind: 'import',
  thumbnail: 'data:image/webp;base64,AAAA',
  createdAt: 0,
  ...extra,
})

export const createEvidence = (id: string, extra: Partial<GenerationEvidence> = {}): GenerationEvidence => ({
  id,
  capturedAt: 0,
  compiledPrompt: 'a cat',
  frame: createRect(),
  modelId: 'google/gemini-nano-banana-2.1',
  outputAssetId: `out-${id}`,
  prompt: 'a cat',
  quality: '',
  ratio: '1:1',
  referenceAssetIds: [],
  resolution: '',
  ...extra,
})

export const resetProject = (document: Partial<ProjectDocument> = {}) => {
  projectStore.reset({
    layers: [],
    ingredients: [],
    ...document,
  })
}
