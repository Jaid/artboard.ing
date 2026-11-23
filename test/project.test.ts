import {describe, expect, test} from 'bun:test'

import {getPersistedEditorState} from '#src/lib/autosave.ts'
import {collectDocumentAssetIds, parseEditor, parseProjectDocument} from '#src/lib/projectSchema.ts'

import {createDocument, createEvidence, createIngredient, createLayer, createRect} from './lib/fixtures.ts'

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
  test('generated entries keep their request capture and its images, transforms without a frame', () => {
    const {frame, ...capture} = createEvidence('transform', {
      outputAssetId: 'asset-1',
      referenceAssetIds: ['sent-reference'],
    })
    expect(frame).toBeDefined()
    const document = createDocument({ingredients: [createIngredient(1, {
      kind: 'generated',
      evidence: capture,
    }), createIngredient(2, {
      assetId: 'out-turned',
      sourceAssetId: 'out-canvas',
      rotation: 90,
      kind: 'generated',
      evidence: createEvidence('canvas', {
        canvasAssetId: 'captured-canvas',
        outputAssetId: 'out-canvas',
      }),
    })]})
    const parsed = parseProjectDocument(structuredClone(document))
    expect(parsed.ingredients.map(item => item.evidence)).toEqual(document.ingredients.map(item => item.evidence))
    expect([...collectDocumentAssetIds([parsed])].toSorted()).toEqual(['asset-1', 'captured-canvas', 'out-canvas', 'out-turned', 'sent-reference'])
  })
  test('a request capture must belong to a generated entry and describe its original image', () => {
    const evidence = createEvidence('a', {outputAssetId: 'asset-1'})
    for (const ingredient of [createIngredient(1, {evidence}), createIngredient(1, {
      kind: 'generated',
      evidence: {
        ...evidence,
        outputAssetId: 'elsewhere',
      },
    })]) {
      expect(() => parseProjectDocument(createDocument({ingredients: [ingredient]}))).toThrow()
    }
  })
  test('layer captures still need the frame their result was placed in', () => {
    const {frame, ...capture} = createEvidence('a')
    expect(frame).toBeDefined()
    const generated = {
      ...layer,
      kind: 'generated',
    }
    expect(parseLayers({
      ...generated,
      evidence: createEvidence('a'),
    }).layers[0].evidence?.frame).toEqual(createRect(100, 100))
    expect(() => parseLayers({
      ...generated,
      evidence: capture,
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
      if (key === 'resolution' || key === 'quality' || key === 'shots') {
        expect(() => parseEditor(incomplete)).not.toThrow()
      } else {
        expect(() => parseEditor(incomplete)).toThrow()
      }
    }
  })
  test('autosaves from before the shots dropdown ask for one shot, and stored shots stay within 1–8', () => {
    const {shots: _, ...editor} = getPersistedEditorState()
    expect(parseEditor(editor).shots).toBe(1)
    expect(parseEditor({
      ...editor,
      shots: 5,
    }).shots).toBe(5)
    expect(parseEditor({
      ...editor,
      shots: 40,
    }).shots).toBe(8)
    expect(parseEditor({
      ...editor,
      shots: 'many',
    }).shots).toBe(1)
  })
})
