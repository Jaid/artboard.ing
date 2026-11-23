import type {Ingredient, IngredientEvidence, Layer} from './state.ts'

import {getSourceAssetId} from './ingredientOrientation.ts'
import {getAssetOccurrences, getRevisions} from './revisions.ts'

export const kindTitles: Record<Ingredient['kind'], string> = {
  import: 'import',
  generated: 'generation',
  snapshot: 'canvas snapshot',
}

const layerCount = (count: number) => `${count} layer${count === 1 ? '' : 's'}`

/** where the image of a collection entry is used, like “Shown by 2 layers · Unselected revision in 1 layer” */
export const describeUsage = (layers: ReadonlyArray<Layer>, assetId: string) => {
  const occurrences = getAssetOccurrences(layers, assetId)
  const buried = occurrences.filter(item => item.buried).length
  const shown = occurrences.length - buried
  return [shown && `Shown by ${layerCount(shown)}`, buried && `Unselected revision in ${layerCount(buried)}`].filter(Boolean).join(' · ') || 'Not on the canvas'
}

/**
 * The request capture of a generated collection entry.
 * Entries from before the collection kept captures fall back to the layer or revision that holds their image, as raw output or as shown.
 */
export const getIngredientEvidence = (ingredient: Ingredient, layers: ReadonlyArray<Layer>): IngredientEvidence | undefined => {
  if (ingredient.evidence || ingredient.kind !== 'generated') {
    return ingredient.evidence
  }
  const output = getSourceAssetId(ingredient)
  return layers.flatMap(layer => getRevisions(layer)).find(revision => revision.evidence.outputAssetId === output || revision.assetId === ingredient.assetId)?.evidence
}
