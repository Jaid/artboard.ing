import {describe, expect, test} from 'bun:test'

import {compilePrompt, findReferences, stripComments} from '#src/lib/prompt.ts'

const compile = (text: string, hasCanvasContent = true, extra: Partial<Parameters<typeof compilePrompt>[0]> = {}) => compilePrompt({
  text,
  hasCanvasContent,
  ingredientIndices: [1, 2, 7],
  maxReferences: 14,
  ...extra,
})
const canvas = {kind: 'canvas'} as const
const ingredient = (index: number) => ({
  kind: 'ingredient',
  index,
}) as const
describe('references', () => {
  test('are found in order of appearance', () => {
    expect(findReferences('a ![1] b ![0]').map(reference => reference.index)).toEqual([1, 0])
  })
  test('carry their description and ranges', () => {
    const text = String.raw`a ![1](the (tall) tower) b ![2]( spaced \) out ) c ![0](this scene)`
    const tokens = findReferences(text)
    expect(tokens.map(token => [token.index, token.description])).toEqual([[1, 'the (tall) tower'], [2, 'spaced ) out'], [0, 'this scene']])
    expect(text.slice(tokens[0].start, tokens[0].referenceEnd)).toBe('![1]')
    expect(text.slice(tokens[0].start, tokens[0].end)).toBe('![1](the (tall) tower)')
  })
  test('without a closing parenthesis fall back to a bare reference', () => {
    expect(findReferences('![1](never closed').map(token => [token.index, token.description])).toEqual([[1, undefined]])
  })
  test('ignore escapes, code spans, comments and complete Markdown images', () => {
    expect(findReferences(String.raw`literal \![2] and ![1]`).map(token => token.index)).toEqual([1])
    expect(findReferences('`![2]` <!-- ![7] --> ![1]').map(token => token.index)).toEqual([1])
    for (const text of ['![2](https://example.invalid/a.png)', '![2](./a.png)', '![2](logo.png "Logo")', '![2](</a b.png>)', '![2](data:image/png;base64,AAAA)', '![7][ref]']) {
      expect(findReferences(text)).toEqual([])
    }
  })
})
describe('compiling', () => {
  test('sends the canvas first even when ![0] is omitted', () => {
    const compiled = compile('The hand should hold a cup of coffee with ![2] printed on it')
    expect(compiled.errors).toEqual([])
    expect(compiled.sources).toEqual([canvas, ingredient(2)])
    expect(compiled.text).toContain('with [Image 2] printed on it')
  })
  test('rewrites references to image positions', () => {
    expect(compile('Please put the face of ![1] onto the head of ![0]').text).toContain('Please put the face of [Image 2] onto the head of [Image 1]')
  })
  test('attaches only referenced ingredients, once each, in first-mention order', () => {
    expect(compile('![7] ![2] ![7]').sources).toEqual([canvas, ingredient(7), ingredient(2)])
    const compiled = compile('![2] next to ![2] and ![1]', false)
    expect(compiled.sources).toEqual([ingredient(2), ingredient(1)])
    expect(compiled.text).toContain('[Image 1] next to [Image 1] and [Image 2]')
  })
  test('writes descriptions directly before the image', () => {
    const compiled = compile('Please add ![2](this witch) to the image')
    expect(compiled.errors).toEqual([])
    expect(compiled.text).toContain('Please add this witch [Image 2] to the image')
    expect(compile('Show ![1]() please', false).text).toContain('Show [Image 1] please')
  })
  test('passes plain text on an empty frame through unchanged', () => {
    expect(compile('a lighthouse', false)).toEqual({
      sources: [],
      errors: [],
      text: 'a lighthouse',
    })
  })
  test('mentions empty canvas areas', () => {
    expect(compile('extend', true, {canvasHasEmptyAreas: true}).text).toContain('gray')
  })
  test('keeps escaped references literal', () => {
    expect(compile(String.raw`literal \![2]`).sources).toEqual([canvas])
  })
  test('strips HTML comments', () => {
    expect(stripComments('a <!-- note ![9] --> b')).toBe('a  b')
    expect(compile('a <!-- ![9] -->', false).errors).toEqual([])
  })
})
describe('errors before provider dispatch', () => {
  test('missing, unknown and unsafe references', () => {
    expect(compile('![3]').errors).toHaveLength(1)
    expect(compile('![9007199254740993]').errors).toHaveLength(1)
    expect(compile('![5]', false).errors[0]).toContain('![5]')
  })
  test('an explicit canvas on an empty frame', () => {
    expect(compile('Edit ![0]', false).errors.join()).toContain('empty frame')
  })
  test('empty and comment-only prompts', () => {
    expect(compile('  ', false).errors).toContain('The prompt is empty.')
    expect(compile('<!-- draft -->').errors).toContain('The prompt is empty.')
  })
  test('too many images', () => {
    expect(compile('![1] ![2]', true, {maxReferences: 2}).errors.join(' ')).toContain('at most 2')
  })
})
