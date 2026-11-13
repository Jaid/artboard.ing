import {describe, expect, test} from 'bun:test'

import {createInterleavedPromptParts, createSequentialPromptParts, getPromptPartsFactory} from '#src/lib/promptParts.ts'

describe('prompt parts', () => {
  test('sequential parts put all text first', () => {
    expect(createSequentialPromptParts('put [image 2] onto [image 1]', ['a', 'b'])).toEqual([
      {
        type: 'text',
        text: 'put [image 2] onto [image 1]',
      },
      {
        type: 'image',
        image: 'a',
      },
      {
        type: 'image',
        image: 'b',
      },
    ])
  })
  test('interleaved parts follow the first mention of each image', () => {
    expect(createInterleavedPromptParts('put [image 2] onto [image 1], like [image 2] again', ['a', 'b', 'c'])).toEqual([
      {
        type: 'text',
        text: 'put [image 2]',
      },
      {
        type: 'image',
        image: 'b',
      },
      {
        type: 'text',
        text: ' onto [image 1]',
      },
      {
        type: 'image',
        image: 'a',
      },
      {
        type: 'text',
        text: ', like [image 2] again',
      },
      {
        type: 'image',
        image: 'c',
      },
    ])
  })
  test('a prompt that ends with a label has no empty trailing text', () => {
    expect(createInterleavedPromptParts('restyle [image 1]', ['a']).map(part => part.type)).toEqual(['text', 'image'])
  })
  test('model IDs pick their factory by pattern', () => {
    expect(getPromptPartsFactory('gemini-3.1-flash-image')).toBe(createInterleavedPromptParts)
    expect(getPromptPartsFactory('gpt-image-2.5-sunburst')).toBe(createSequentialPromptParts)
  })
})
