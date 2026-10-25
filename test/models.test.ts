import {describe, expect, test} from 'bun:test'

import {parseImageResult, readBoundedBody, validateImageRequest} from '#src/lib/imageApi.ts'
import catalog from '#src/lib/models/catalog.json'
import {defaultModel, findModel, getModel, models, parseImageCatalog} from '#src/lib/models/index.ts'
import {isRatioString} from '#src/lib/ratio.ts'

const request = {
  model: models[0].id,
  prompt: 'Make a change',
  aspect_ratio: '1:1',
  resolution: '1K',
  input_references: [{
    type: 'image_url',
    image_url: {url: 'data:image/png;base64,AAAA'},
  }],
}
describe('models', () => {
  test('all nine models come from the dedicated image catalog', () => {
    expect(models.map(model => model.id)).toEqual([
      'google/gemini-3.1-flash-lite-image',
      'google/gemini-3.1-flash-image',
      'google/gemini-nano-banana-2.1',
      'openai/gpt-image-2.5-sunburst',
      'black-forest-labs/flux-3-image',
      'x-ai/grok-imagine-image-2.0',
      'bytedance-seed/seedream-5-0-flash',
      'bytedance-seed/seedream-5-0-lite',
      'bytedance-seed/seedream-5-0-pro',
    ])
    expect(parseImageCatalog(catalog).map(item => item.id)).toEqual(models.map(model => model.id))
  })
  test('a generic chat catalog cannot masquerade as image capabilities', () => {
    expect(() => parseImageCatalog({data: [{
      id: models[0].id,
      architecture: {output_modalities: ['image']},
    }]})).toThrow()
  })
  test('Nano Banana 2.1 is the default', () => {
    expect(defaultModel.id).toBe('google/gemini-nano-banana-2.1')
    expect(getModel(undefined).title).toBe('Nano Banana 2.1')
  })
  test('models resolve with or without vendor prefix', () => {
    expect(findModel('gemini-3.1-flash-image')?.id).toBe('google/gemini-3.1-flash-image')
    expect(findModel('gpt-image-2.5-sunburst')?.id).toBe('openai/gpt-image-2.5-sunburst')
    expect(findModel('nope')).toBeUndefined()
    expect(getModel('nope')).toBe(defaultModel)
  })
  test('every model supports 1:1 and only valid ratios', () => {
    for (const model of models) {
      expect(model.supportsRatio('1:1')).toBe(true)
      expect(model.aspectRatios.every(isRatioString)).toBe(true)
    }
  })
  test('request options only contain supported values', () => {
    expect(getModel('x-ai/grok-imagine-image-2.0').getRequestOptions({
      resolution: '4K',
      quality: 'max',
    })).toEqual({
      resolution: '1K',
      quality: 'medium',
    })
    expect(getModel('openai/gpt-image-2.5-sunburst').getRequestOptions({quality: 'high'})).toEqual({quality: 'high'})
    expect(getModel('bytedance-seed/seedream-5-0-lite').getRequestOptions({})).toEqual({resolution: '2K'})
  })
})
describe('Image API requests', () => {
  test('aliases are normalized and extra provider fields are discarded', () => {
    const parsed = validateImageRequest({
      ...request,
      model: 'gemini-3.1-flash-image',
      n: 99,
      messages: ['wrong endpoint'],
      tools: ['unsafe extra'],
      secret: 'not forwarded',
    })
    expect(parsed.model).toBe('google/gemini-3.1-flash-image')
    expect(parsed.n).toBe(1)
    expect(Object.keys(parsed).toSorted((a, b) => a.localeCompare(b))).toEqual(['aspect_ratio', 'input_references', 'model', 'n', 'prompt', 'resolution'])
  })
  test('remote input URLs are rejected', () => {
    expect(() => validateImageRequest({
      ...request,
      input_references: [{
        type: 'image_url',
        image_url: {url: 'https://example.invalid/private'},
      }],
    })).toThrow('embedded')
  })
  test('too many references are rejected rather than silently discarded', () => {
    expect(() => validateImageRequest({
      ...request,
      model: 'x-ai/grok-imagine-image-2.0',
      input_references: Array.from({length: 4}, () => request.input_references[0]),
    })).toThrow('at most 3')
  })
  test('unsupported model, ratio, resolution and quality fail explicitly', () => {
    for (const change of [{model: 'unknown'}, {aspect_ratio: '0:1'}, {resolution: '8K'}, {quality: 'imaginary'}]) {
      expect(() => validateImageRequest({
        ...request,
        ...change,
      })).toThrow()
    }
  })
})
describe('Image API responses', () => {
  test('provider echoes are stripped and the numeric cost is kept', () => {
    expect(parseImageResult({
      data: [{
        b64_json: 'AAAA',
        media_type: 'image/png',
        extra: 'ignored',
      }],
      usage: {
        cost: 0.03,
        token: 'ignored',
      },
      key: 'ignored',
    })).toEqual({
      data: [{
        b64_json: 'AAAA',
        media_type: 'image/png',
      }],
      usage: {cost: 0.03},
    })
  })
  test('a chat completion is not accepted', () => {
    expect(() => parseImageResult({choices: [{message: {images: []}}]})).toThrow()
  })
  test('oversized streamed bodies are canceled', async () => {
    let canceled = false
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(6))
      },
      cancel() {
        canceled = true
      },
    })
    await expect(readBoundedBody(new Response(stream), 10)).rejects.toThrow('size limit')
    expect(canceled).toBe(true)
  })
})
