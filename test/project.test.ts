import {describe, expect, test} from 'bun:test'

import {getPersistedEditorState} from '#src/lib/autosave.ts'
import {collectDocumentAssetIds, parseEditor, parseProjectDocument} from '#src/lib/projectSchema.ts'

import {createDocument, createIngredient, createLayer, createRect} from './lib/fixtures.ts'

const layer = createLayer('layer', {
  assetId: 'asset',
  rect: createRect(100, 50),
})
const parseLayers = (...layers: Array<Record<string, unknown>>) => parseProjectDocument({
  ...createDocument(),
  layers,
})
describe('project validation', () => {
  test('accepts an ordinary document and drops untrusted thumbnails', () => {
    const result = parseProjectDocument(createDocument({
      layers: [layer],
      ingredients: [createIngredient(2, {thumbnail: 'https://not-loaded.invalid'})],
      nextIngredientIndex: 3,
    }))
    expect(result.ingredients[0].thumbnail).toBe('')
    expect(result.nextIngredientIndex).toBe(3)
  })
  test('rejects duplicate layer identifiers', () => {
    expect(() => parseLayers(layer, layer)).toThrow()
  })
  test('rejects invalid geometry, masks and generated rotations', () => {
    expect(parseLayers(layer).layers).toHaveLength(1)
    for (const invalid of [{rect: createRect(0, 50)}, {area: 1.1}, {
      kind: 'generated',
      rotation: 10,
    }]) {
      expect(() => parseLayers({
        ...layer,
        ...invalid,
      })).toThrow()
    }
  })
  test('collection numbers cannot be reused by a stale or missing counter', () => {
    const ingredients = [createIngredient(5)]
    expect(() => parseProjectDocument({
      layers: [],
      ingredients,
      nextIngredientIndex: 3,
    })).toThrow()
    expect(() => parseProjectDocument({
      layers: [],
      ingredients,
    })).toThrow()
  })
  test('collection entries need a known kind', () => {
    const {kind, ...withoutKind} = createIngredient(1)
    expect(parseProjectDocument(createDocument({ingredients: [createIngredient(1, {kind})]})).ingredients).toHaveLength(1)
    expect(() => parseProjectDocument({
      layers: [],
      ingredients: [withoutKind],
      nextIngredientIndex: 2,
    })).toThrow()
  })
  test('hidden layers still keep their source images reachable', () => {
    expect([...collectDocumentAssetIds([createDocument({layers: [{
      ...layer,
      visible: false,
    }]})])]).toEqual(['asset'])
  })
  test('the editor state round-trips and incomplete states are rejected', () => {
    const editor = getPersistedEditorState()
    expect(parseEditor(structuredClone(editor))).toEqual(editor)
    for (const key of Object.keys(editor)) {
      const incomplete: Record<string, unknown> = {...editor}
      delete incomplete[key]
      if (key === 'resolution' || key === 'quality') {
        expect(() => parseEditor(incomplete)).not.toThrow()
      } else {
        expect(() => parseEditor(incomplete)).toThrow()
      }
    }
  })
})
