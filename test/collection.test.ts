import {describe, expect, test} from 'bun:test'

import {withIngredient} from '#src/lib/actions.ts'
import {describeUsage, getIngredientEvidence} from '#src/lib/collectionDetails.ts'
import {stepCollectionIndex} from '#src/lib/collectionDialog.ts'
import {getIngredientFileName} from '#src/lib/exporting.ts'
import {padInsertion} from '#src/lib/promptEditor.ts'
import {getThumbnailFit, maxThumbnailAspect, minThumbnailAspect} from '#src/lib/thumbnailFit.ts'

import {createDocument, createEvidence, createIngredient, createLayer} from './lib/fixtures.ts'

const fileName = (index: number, name: string, mediaType: string) => getIngredientFileName({
  index,
  name,
}, mediaType)
describe('collection numbering', () => {
  test('adding an entry advances the counter and never duplicates an image', () => {
    const document = createDocument()
    const ingredient = createIngredient(4)
    const added = withIngredient(document, ingredient)
    expect(added.ingredients).toHaveLength(1)
    expect(added.nextIngredientIndex).toBe(5)
    expect(withIngredient(added, createIngredient(5, {assetId: ingredient.assetId}))).toBe(added)
  })
})
describe('collection dialog steps', () => {
  // The frame view, then items whose numbers have gaps from deletions.
  const order = [0, 2, 5, 9]
  test('left and right go through the tiles in order and wrap around', () => {
    expect(stepCollectionIndex(order, 2, 'next')).toBe(5)
    expect(stepCollectionIndex(order, 5, 'previous')).toBe(2)
    expect(stepCollectionIndex(order, 9, 'next')).toBe(0)
    expect(stepCollectionIndex(order, 0, 'previous')).toBe(9)
  })
  test('up jumps to the frame view, down to the last item', () => {
    expect(stepCollectionIndex(order, 5, 'first')).toBe(0)
    expect(stepCollectionIndex(order, 5, 'last')).toBe(9)
  })
  test('the frame view alone stays where it is, and a vanished item leads to the frame view', () => {
    expect(stepCollectionIndex([0], 0, 'next')).toBe(0)
    expect(stepCollectionIndex([0], 0, 'last')).toBe(0)
    expect(stepCollectionIndex(order, 3, 'next')).toBe(0)
  })
})
describe('collection thumbnails', () => {
  test('moderate aspects keep the whole image', () => {
    expect(getThumbnailFit(300, 200)).toEqual({aspect: 1.5})
    expect(getThumbnailFit(200, 300)).toEqual({aspect: 2 / 3})
    expect(getThumbnailFit(400, 200)).toEqual({aspect: 2})
  })
  test('very tall images are cropped to 2:3 with top and bottom marked', () => {
    expect(getThumbnailFit(48, 192)).toEqual({
      aspect: minThumbnailAspect,
      crop: 'vertical',
    })
  })
  test('very wide images are cropped to 2:1 with left and right marked', () => {
    expect(getThumbnailFit(1000, 200)).toEqual({
      aspect: maxThumbnailAspect,
      crop: 'horizontal',
    })
  })
  test('rounding noise just past a limit is not flagged as a crop', () => {
    expect(getThumbnailFit(2010, 1000)).toEqual({aspect: maxThumbnailAspect})
    expect(getThumbnailFit(1000, 1505)).toEqual({aspect: minThumbnailAspect})
  })
  test('unknown dimensions fall back to a square', () => {
    expect(getThumbnailFit(0, 0)).toEqual({aspect: 1})
  })
})
describe('collection details', () => {
  const generated = createLayer('generated', {
    assetId: 'out-b',
    kind: 'generated',
    evidence: createEvidence('b'),
    revision: 1,
    revisions: [{
      assetId: 'out-a',
      evidence: createEvidence('a', {prompt: 'a dog'}),
    }, {
      assetId: 'out-b',
      evidence: createEvidence('b'),
    }],
  })
  test('a generated entry keeps its own request capture', () => {
    const {frame, ...capture} = createEvidence('transform', {outputAssetId: 'asset-1'})
    expect(frame).toBeDefined()
    const ingredient = createIngredient(1, {
      kind: 'generated',
      evidence: capture,
    })
    expect(getIngredientEvidence(ingredient, [])).toBe(capture)
  })
  test('entries without a capture find it in the layer or revision that holds their original image', () => {
    expect(getIngredientEvidence(createIngredient(1, {
      assetId: 'out-a',
      kind: 'generated',
    }), [generated])?.prompt).toBe('a dog')
    // A rotated entry shows other pixels, but its original is still the generation’s output.
    expect(getIngredientEvidence(createIngredient(2, {
      assetId: 'out-b-turned',
      sourceAssetId: 'out-b',
      rotation: 90,
      kind: 'generated',
    }), [generated])?.id).toBe('b')
    // An entry recreated from a layer that shows turned pixels only knows those.
    expect(getIngredientEvidence(createIngredient(3, {
      assetId: 'turned',
      kind: 'generated',
    }), [createLayer('turned', {
      assetId: 'turned',
      kind: 'generated',
      evidence: createEvidence('c', {outputAssetId: 'out-c'}),
    })])?.id).toBe('c')
    expect(getIngredientEvidence(createIngredient(4, {assetId: 'out-a'}), [generated])).toBeUndefined()
  })
  test('usage counts the layers that show an image and those that keep it as a revision', () => {
    expect(describeUsage([generated], 'out-b')).toBe('Shown by 1 layer')
    expect(describeUsage([generated, createLayer('copy', {assetId: 'out-a'})], 'out-a')).toBe('Shown by 1 layer · Unselected revision in 1 layer')
    expect(describeUsage([generated], 'elsewhere')).toBe('Not on the canvas')
  })
})
describe('inserting references', () => {
  test('a reference dropped between two words keeps both apart', () => {
    expect(padInsertion('![1]', 'e', 'ca')).toBe(' ![1] ')
    expect(padInsertion('![1]', ' ', 'ca')).toBe('![1] ')
    expect(padInsertion('![1]', 'e', ' c')).toBe(' ![1]')
    expect(padInsertion('![1]', '', '')).toBe('![1]')
  })
  test('punctuation and brackets stay attached', () => {
    expect(padInsertion('![1]', 't', '.')).toBe(' ![1]')
    expect(padInsertion('![1]', 't', ', ')).toBe(' ![1]')
    expect(padInsertion('![1]', '(', ')')).toBe('![1]')
    expect(padInsertion('![1]', '“', '”')).toBe('![1]')
  })
  test('nothing after the reference can turn into its description or merge with the next reference', () => {
    expect(padInsertion('![1]', ' ', '(t')).toBe('![1] ')
    expect(padInsertion('![1]', ' ', '![')).toBe('![1] ')
    expect(padInsertion('![1]', ' ', '!')).toBe('![1]')
  })
})
describe('collection export', () => {
  test('file names follow the item name and its original format', () => {
    expect(fileName(3, 'red', 'image/png')).toBe('red.png')
    expect(fileName(3, 'a/b: "c"?', 'image/jpeg')).toBe('a b c.jpg')
    expect(fileName(4, '…', 'image/webp')).toBe('….webp')
    expect(fileName(5, ' / ', 'image/svg+xml')).toBe('artboarding_5.svg')
    expect(fileName(6, '..hidden', 'image/jxl')).toBe('hidden.jxl')
  })
})
