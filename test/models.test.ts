import {describe, expect, test} from 'bun:test'

import {parseImageResult, readBoundedBody, validateImageRequest} from '#src/lib/imageApi.ts'
import catalog from '#src/lib/models/catalog.json'
import {defaultModel, describeModel, findModel, getModel, models, parseImageCatalog, pickListedModels} from '#src/lib/models/index.ts'
import {findModelTraits, getGptImageSize, getRatioSize, modelTraits} from '#src/lib/models/modelTraits.ts'
import {isRatioString, parseRatio} from '#src/lib/ratio.ts'

const findEndpointRatios = (modelId: string) => findModelTraits(modelId)?.ratios
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
  test('Gemini 3.1 Flash Image endpoint ratios resolve with or without vendor prefix', () => {
    const ratios = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'] as const
    expect(findEndpointRatios('gemini-3.1-flash-image')).toEqual(ratios)
    expect(findEndpointRatios('google/gemini-3.1-flash-image')).toEqual(ratios)
    expect(findEndpointRatios('gemini-nano-banana-2.1')).toBeUndefined()
    expect(findEndpointRatios('gemini-3.1-flash-lite-image')).toBeUndefined()
  })
  test('Grok Imagine Image 2.0 exposes only ratios verified through CLIProxyAPI', () => {
    const ratios = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:20', '20:9'] as const
    expect(findEndpointRatios('grok-imagine-image-2.0')).toEqual(ratios)
    expect(findEndpointRatios('x-ai/grok-imagine-image-2.0')).toEqual(ratios)
    expect(findEndpointRatios('grok-imagine-image-2.1')).toBeUndefined()
    for (const excluded of ['9:19.5', '19.5:9', '1:2', '2:1']) {
      expect(ratios).not.toContain(excluded)
    }
  })
  test('GPT Image 2.6 Sunburst has explicit endpoint ratios with either ID form', () => {
    const ratios = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '1:2', '2:1', '9:21', '21:9', '1:3', '3:1'] as const
    expect(findEndpointRatios('gpt-image-2.6-sunburst')).toEqual(ratios)
    expect(findEndpointRatios('openai/gpt-image-2.6-sunburst')).toEqual(ratios)
    expect(findEndpointRatios('gpt-image-2.6-flare')).toBeUndefined()
  })
  test('GPT Image 2.6 Sunburst offers resolution and quality controls', () => {
    expect(findModelTraits('gpt-image-2.6-sunburst')?.controls).toEqual({
      resolution: ['1K', '2K', '4K'],
      quality: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
    })
  })
  test('GPT Image sizes follow the ratio and resolution tier within OpenAI’s limits', () => {
    expect(getGptImageSize(1, '1K')).toBe('1024x1024')
    expect(getGptImageSize(1, '2K')).toBe('2048x2048')
    expect(getGptImageSize(16 / 9, '4K')).toBe('3840x2160')
    expect(getGptImageSize(9 / 16, '4K')).toBe('2160x3840')
    expect(getGptImageSize(1, 'unknown')).toBe('1024x1024')
    for (const ratio of findModelTraits('gpt-image-2.6-sunburst')?.ratios ?? []) {
      for (const resolution of ['1K', '2K', '4K']) {
        const [width, height] = getGptImageSize(parseRatio(ratio), resolution).split('x').map(Number)
        expect(width % 16).toBe(0)
        expect(height % 16).toBe(0)
        expect(Math.max(width, height)).toBeLessThanOrEqual(3840)
        expect(width * height).toBeGreaterThanOrEqual(655_360)
        expect(width * height).toBeLessThanOrEqual(8_294_400)
        expect(Math.abs(Math.log(width / height / parseRatio(ratio)))).toBeLessThan(0.02)
      }
    }
  })
  test('the GPT Image hook replaces aspect_ratio and resolution with a size', () => {
    const hook = findModelTraits('openai/gpt-image-2.6-sunburst')?.hook
    expect(hook?.({
      model: 'gpt-image-2.6-sunburst',
      aspect_ratio: '16:9',
      resolution: '2K',
      quality: 'high',
    }, {
      aspectRatio: '16:9',
      resolution: '2K',
      quality: 'high',
    })).toEqual({
      model: 'gpt-image-2.6-sunburst',
      quality: 'high',
      size: '2736x1536',
    })
  })
  test('Grok Imagine 2.0 offers the endpoint’s resolutions and qualities', () => {
    expect(findModelTraits('x-ai/grok-imagine-image-2.0')?.controls).toEqual({
      resolution: ['1K', '2K'],
      quality: ['auto', 'low', 'medium'],
    })
  })
  test('the Gemini hook sends the quality as thinking level', () => {
    expect(findModelTraits('google/gemini-3.1-flash-image')?.hook?.({
      model: 'gemini-3.1-flash-image',
      image_config: {aspect_ratio: '1:1'},
      quality: 'minimal',
    }, {quality: 'minimal'})).toEqual({
      model: 'gemini-3.1-flash-image',
      image_config: {aspect_ratio: '1:1'},
      reasoning_effort: 'minimal',
    })
  })
  test('the Muse Image hook sends the ratio as size and the quality as reasoning strength', () => {
    const hook = findModelTraits('muse-image-1.0')?.hook
    expect(hook?.({
      model: 'muse-image-1.0',
      aspect_ratio: '9:16',
      quality: 'low',
    }, {
      aspectRatio: '9:16',
      quality: 'low',
    })).toEqual({
      model: 'muse-image-1.0',
      size: '1024x1820',
      reasoning_strength: 'low',
    })
    expect(getRatioSize(16)).toBe('16384x1024')
    expect(getRatioSize(parseRatio('19.5:9'))).toBe('2219x1024')
    for (const ratio of findModelTraits('muse-image-1.0')?.ratios ?? []) {
      const [width, height] = getRatioSize(parseRatio(ratio)).split('x').map(Number)
      expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true)
      expect(Math.abs(Math.log(width / height / parseRatio(ratio)))).toBeLessThan(0.001)
    }
  })
  test('every trait pattern matches its model with and without vendor prefix', () => {
    for (const traits of modelTraits) {
      // Family patterns have wildcards after the optional vendor prefix.
      if (traits.pattern.includes('*', 5)) {
        continue
      }
      const id = traits.pattern.replace('{,*/}', '')
      expect(findModelTraits(id)?.pattern).toBe(traits.pattern)
      expect(findModelTraits(`vendor/${id}`)?.pattern).toBe(traits.pattern)
    }
  })
  test('matching traits merge, the most specific entry winning per field', () => {
    const sunburst = findModelTraits('gpt-image-2.6-sunburst')
    expect(sunburst?.title).toBe('GPT Image 2.6 Sunburst')
    expect(sunburst?.vendor).toBe('OpenAI')
    expect(sunburst?.icon?.monochrome).toBe(true)
    expect(findModelTraits('gpt-image-2.6-flare')?.title).toBeUndefined()
    expect(findModelTraits('gpt-image-2.6-flare')?.vendor).toBe('OpenAI')
    expect(findModelTraits('gemini-nano-banana-2.1')?.vendor).toBe('Google')
    expect(findModelTraits('gemini-nano-banana-2.1')?.icon).not.toEqual(findModelTraits('gemini-3.1-flash-image')?.icon)
    expect(findModelTraits('muse-image-1.0')?.vendor).toBe('Meta')
    expect(findModelTraits('unknown-model')).toBeUndefined()
  })
  test('every catalog model has a vendor and an icon from its traits', () => {
    for (const model of models) {
      expect(model.icon?.url).toBeString()
      expect(model.vendor).toBe(findModelTraits(model.shortId)!.vendor!)
    }
    expect(getModel('google/gemini-3.1-flash-image').title).toBe('Gemini 3.1 Flash Image')
    expect(getModel('google/gemini-3.1-flash-lite-image').title).toBe('Gemini Flash Lite')
  })
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
  test('a models list limits the picker to its models in its order', () => {
    expect(pickListedModels(models, [])).toBe(models)
    expect(pickListedModels(models, ['x-ai/grok-imagine-image-2.0', 'gemini-3.1-flash-image', 'nope', 'grok-imagine-image-2.0']).map(model => model.id)).toEqual(['x-ai/grok-imagine-image-2.0', 'google/gemini-3.1-flash-image'])
    const pinned = getModel('openai/gpt-image-2.5-sunburst')
    expect(pickListedModels(models, ['gemini-3.1-flash-image', 'gpt-image-2.5-sunburst'], [pinned]).map(model => model.id)).toEqual(['openai/gpt-image-2.5-sunburst', 'google/gemini-3.1-flash-image'])
  })
  test('any model ID can be described, offered or not', () => {
    expect(describeModel('google/gemini-3.1-flash-image').title).toBe('Gemini 3.1 Flash Image')
    expect(describeModel('gpt-image-2.6-sunburst').title).toBe('GPT Image 2.6 Sunburst')
    expect(describeModel('gpt-image-2.6-sunburst').icon?.monochrome).toBe(true)
    expect(describeModel('muse-image-1.0').icon?.url).toBeString()
    expect(describeModel('someone/unknown-model')).toEqual({
      title: 'someone/unknown-model',
      icon: undefined,
    })
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
