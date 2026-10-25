import type {ProjectDocument} from '#src/lib/state.ts'

import {describe, expect, test} from 'bun:test'

import {withIngredient} from '#src/lib/actions.ts'
import {getIngredientFileName} from '#src/lib/exporting.ts'
import {getThumbnailFit, maxThumbnailAspect, minThumbnailAspect} from '#src/lib/thumbnailFit.ts'

import {createIngredient} from './lib/fixtures.ts'

describe('collection numbering', () => {
  test('adding an entry advances the counter and never duplicates an image', () => {
    const document: ProjectDocument = {
      layers: [],
      ingredients: [],
      nextIngredientIndex: 1,
    }
    const ingredient = createIngredient(4)
    const added = withIngredient(document, ingredient)
    expect(added.ingredients).toHaveLength(1)
    expect(added.nextIngredientIndex).toBe(5)
    expect(withIngredient(added, createIngredient(5, {assetId: ingredient.assetId}))).toBe(added)
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
describe('collection export', () => {
  test('file names follow the item name and its original format', () => {
    const fileName = (index: number, name: string, mediaType: string) => getIngredientFileName({
      index,
      name,
    }, mediaType)
    expect(fileName(3, 'red', 'image/png')).toBe('red.png')
    expect(fileName(3, 'a/b: "c"?', 'image/jpeg')).toBe('a b c.jpg')
    expect(fileName(4, '…', 'image/webp')).toBe('….webp')
    expect(fileName(5, ' / ', 'image/svg+xml')).toBe('artboarding_5.svg')
    expect(fileName(6, '..hidden', 'image/jxl')).toBe('hidden.jxl')
  })
})
