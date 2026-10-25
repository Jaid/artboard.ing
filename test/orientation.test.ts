import type {Orientation} from '#src/lib/orientation.ts'
import type {Layer, ProjectDocument} from '#src/lib/state.ts'

import {describe, expect, test} from 'bun:test'

import {getIngredientOrientation, getSourceAssetId, withIngredientOrientation} from '#src/lib/ingredientOrientation.ts'
import {flips, getPixelTransform, getSymmetry, isIdentitySymmetry, rotations, swapRectAxes, swapsAxes} from '#src/lib/orientation.ts'
import {collectDocumentAssetIds, parseProjectDocument} from '#src/lib/projectSchema.ts'

import {createEvidence, createIngredient, createLayer, createRect} from './lib/fixtures.ts'

type Grid = Array<Array<number>>

// An independent reference: turn the visible picture first, then mirror what is seen.
const turnClockwise = (grid: Grid): Grid => grid[0].map((_, x) => grid.map(row => row[x]).toReversed())
const mirrorHorizontally = (grid: Grid): Grid => grid.map(row => row.toReversed())
const mirrorVertically = (grid: Grid): Grid => grid.toReversed()
const orient = (grid: Grid, {rotation, flip}: Orientation) => {
  let result = grid
  for (let turn = 0; turn < rotation / 90; turn++) {
    result = turnClockwise(result)
  }
  if (flip === 'horizontal') {
    result = mirrorHorizontally(result)
  }
  if (flip === 'vertical') {
    result = mirrorVertically(result)
  }
  return result
}
/** maps every source pixel center through the canvas matrix, like drawing the image with that transform */
const draw = (grid: Grid, orientation: Orientation): Grid => {
  const size = {
    width: grid[0].length,
    height: grid.length,
  }
  const {width, height, matrix: [a, b, c, d, e, f]} = getPixelTransform(size, getSymmetry(orientation))
  const target: Grid = Array.from({length: height}, () => Array.from({length: width}, () => -1))
  for (const [y, row] of grid.entries()) {
    for (const [x, value] of row.entries()) {
      const tx = a * (x + 0.5) + c * (y + 0.5) + e - 0.5
      const ty = b * (x + 0.5) + d * (y + 0.5) + f - 0.5
      expect(Number.isInteger(tx) && Number.isInteger(ty)).toBe(true)
      target[ty][tx] = value
    }
  }
  return target
}
const source: Grid = [
  [1, 2, 3],
  [4, 5, 6],
]
const orientations = rotations.flatMap(rotation => flips.map(flip => ({
  rotation,
  flip,
})))
describe('orientation', () => {
  test('every rotation and flip draws the original pixel-exactly', () => {
    for (const orientation of orientations) {
      expect(draw(source, orientation)).toEqual(orient(source, orientation))
    }
  })
  test('rotations are clockwise, 270 is counterclockwise and flips follow what is seen', () => {
    expect(orient(source, {
      rotation: 90,
      flip: 'none',
    })).toEqual([[4, 1], [5, 2], [6, 3]])
    expect(draw(source, {
      rotation: 270,
      flip: 'none',
    })).toEqual([[3, 6], [2, 5], [1, 4]])
    // Horizontal mirrors the turned picture left to right.
    expect(draw(source, {
      rotation: 90,
      flip: 'horizontal',
    })).toEqual([[1, 4], [2, 5], [3, 6]])
  })
  test('equivalent orientations collapse to the same symmetry', () => {
    expect(isIdentitySymmetry(getSymmetry({
      rotation: 0,
      flip: 'none',
    }))).toBe(true)
    // A horizontal flip after a half turn is the same as a vertical flip alone.
    expect(getSymmetry({
      rotation: 180,
      flip: 'horizontal',
    })).toEqual(getSymmetry({
      rotation: 0,
      flip: 'vertical',
    }))
    expect(getSymmetry({
      rotation: 90,
      flip: 'horizontal',
    })).toEqual(getSymmetry({
      rotation: 270,
      flip: 'vertical',
    }))
    expect(swapsAxes({
      rotation: 270,
      flip: 'vertical',
    })).toBe(true)
    expect(swapsAxes({
      rotation: 180,
      flip: 'horizontal',
    })).toBe(false)
  })
  test('a quarter turn keeps the rect center', () => {
    expect(swapRectAxes({
      x: 10,
      y: 20,
      width: 300,
      height: 100,
    })).toEqual({
      x: 110,
      y: -80,
      width: 100,
      height: 300,
    })
  })
})
const frame = createRect(400, 200)
const layer = (id: string, assetId: string, extra: Partial<Layer> = {}) => createLayer(id, {
  assetId,
  rect: frame,
  ...extra,
})
const ingredient = createIngredient(1, {
  id: 'ingredient',
  assetId: 'original',
  name: 'Image',
  thumbnail: 'thumbnail-original',
})
const evidence = createEvidence('evidence', {
  frame,
  outputAssetId: 'output',
})
const document: ProjectDocument = {
  ingredients: [ingredient],
  layers: [
    layer('shown', 'original', {rotation: 15}),
    layer('other', 'unrelated'),
    layer('generated', 'output', {
      kind: 'generated',
      evidence,
      revision: 0,
      revisions: [{
        assetId: 'output',
        evidence,
      }, {
        assetId: 'original',
        evidence,
        alignment: {
          x: 0,
          y: 0,
          scale: 1,
          applied: true,
        },
      }],
    }),
  ],
  nextIngredientIndex: 2,
}
const quarterTurn: Orientation = {
  rotation: 90,
  flip: 'none',
}
describe('collection entry orientation', () => {
  test('layers showing the image follow the entry and turn their rect', () => {
    const next = withIngredientOrientation(document, 'ingredient', 'original', quarterTurn, {
      assetId: 'turned',
      thumbnail: 'thumbnail-turned',
    })
    expect(next.ingredients[0]).toEqual({
      ...ingredient,
      assetId: 'turned',
      thumbnail: 'thumbnail-turned',
      sourceAssetId: 'original',
      rotation: 90,
    })
    expect(getIngredientOrientation(next.ingredients[0])).toEqual(quarterTurn)
    expect(getSourceAssetId(next.ingredients[0])).toBe('original')
    const shown = next.layers[0]
    expect(shown.assetId).toBe('turned')
    expect(shown.rect).toEqual({
      x: 100,
      y: -100,
      width: 200,
      height: 400,
    })
    // The free rotation of the layer is its own.
    expect(shown.rotation).toBe(15)
    expect(next.layers[1]).toBe(document.layers[1])
    // A kept revision follows as well, and its registration no longer applies.
    expect(next.layers[2].assetId).toBe('output')
    expect(next.layers[2].rect).toEqual(document.layers[2].rect)
    expect(next.layers[2].revisions![1]).toEqual({
      assetId: 'turned',
      evidence,
    })
    expect([...collectDocumentAssetIds([next])]).toContain('original')
  })
  test('the original returns exactly, and a flip on top of a turn keeps the turned rect', () => {
    const turned = withIngredientOrientation(document, 'ingredient', 'original', quarterTurn, {
      assetId: 'turned',
      thumbnail: '',
    })
    const flipped = withIngredientOrientation(turned, 'ingredient', 'original', {
      rotation: 90,
      flip: 'vertical',
    }, {
      assetId: 'turned-flipped',
      thumbnail: '',
    })
    expect(flipped.layers[0].rect).toEqual(turned.layers[0].rect)
    expect(flipped.ingredients[0].flip).toBe('vertical')
    const restored = withIngredientOrientation(flipped, 'ingredient', 'original', {
      rotation: 0,
      flip: 'none',
    }, {
      assetId: 'original',
      thumbnail: 'thumbnail-original',
    })
    expect(restored.ingredients[0]).toEqual(ingredient)
    expect(restored.layers[0]).toEqual(document.layers[0])
  })
  test('every orientation is distinct, so no flip duplicates a rotation', () => {
    const keys = orientations.map(orientation => JSON.stringify(orient(source, orientation)))
    // 4 rotations × 3 flips reach all 8 symmetries of a rectangle.
    expect(new Set(keys).size).toBe(8)
    for (const rotation of rotations) {
      for (const flip of ['horizontal', 'vertical'] as const) {
        const flipped = JSON.stringify(orient(source, {
          rotation,
          flip,
        }))
        expect(rotations.map(other => JSON.stringify(orient(source, {
          rotation: other,
          flip: 'none',
        })))).not.toContain(flipped)
      }
    }
  })
  test('nothing changes for a missing entry or another original', () => {
    const image = {
      assetId: 'turned',
      thumbnail: '',
    }
    expect(withIngredientOrientation(document, 'missing', 'original', quarterTurn, image)).toBe(document)
    expect(withIngredientOrientation(document, 'ingredient', 'elsewhere', quarterTurn, image)).toBe(document)
  })
  test('projects keep the orientation and reject inconsistent entries', () => {
    const turned = withIngredientOrientation(document, 'ingredient', 'original', {
      rotation: 270,
      flip: 'horizontal',
    }, {
      assetId: 'turned',
      thumbnail: '',
    })
    const parsed = parseProjectDocument(structuredClone(turned))
    expect(parsed.ingredients[0]).toMatchObject({
      assetId: 'turned',
      sourceAssetId: 'original',
      rotation: 270,
      flip: 'horizontal',
    })
    const withIngredient = (patch: Record<string, unknown>) => ({
      ...turned,
      ingredients: [{
        ...turned.ingredients[0],
        ...patch,
      }],
    })
    expect(() => parseProjectDocument(withIngredient({sourceAssetId: undefined}))).toThrow()
    expect(() => parseProjectDocument(withIngredient({rotation: 45}))).toThrow()
    expect(() => parseProjectDocument(withIngredient({flip: 'diagonal'}))).toThrow()
    expect(() => parseProjectDocument(withIngredient({
      rotation: undefined,
      flip: undefined,
    }))).toThrow()
  })
})
