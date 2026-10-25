import {describe, expect, test} from 'bun:test'

import {collectDocumentAssetIds, parseProjectDocument} from '#src/lib/projectSchema.ts'

import {createIngredient, createLayer, createRect} from './lib/fixtures.ts'

const layer = createLayer('layer', {
  assetId: 'asset',
  rect: createRect(100, 50),
})
describe('portable project validation', () => {
  test('accepts an ordinary document and drops untrusted thumbnails', () => {
    const result = parseProjectDocument({
      layers: [layer],
      ingredients: [createIngredient(2, {thumbnail: 'https://not-loaded.invalid'})],
      nextIngredientIndex: 3,
    })
    expect(result.ingredients[0].thumbnail).toBe('')
    expect(result.nextIngredientIndex).toBe(3)
  })
  test('rejects duplicate layer identifiers', () => {
    expect(() => parseProjectDocument({
      layers: [layer, layer],
      ingredients: [],
    })).toThrow()
  })
  test('rejects invalid geometry, masks and generated rotations', () => {
    const invalidLayers = [{
      ...layer,
      rect: createRect(0, 50),
    }, {
      ...layer,
      area: 1.1,
    }, {
      ...layer,
      kind: 'generated',
      rotation: 10,
    }]
    for (const invalid of invalidLayers) {
      expect(() => parseProjectDocument({
        layers: [invalid],
        ingredients: [],
      })).toThrow()
    }
  })
  test('collection numbers cannot be reused by a stale counter', () => {
    expect(() => parseProjectDocument({
      layers: [],
      ingredients: [createIngredient(5)],
      nextIngredientIndex: 3,
    })).toThrow()
  })
  test('hidden layers still keep their source images reachable', () => {
    expect([...collectDocumentAssetIds([{
      layers: [{
        ...layer,
        visible: false,
      }],
      ingredients: [],
    }])]).toEqual(['asset'])
  })
})
