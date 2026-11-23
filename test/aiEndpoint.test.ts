import type {ImageModel} from '#src/lib/models/index.ts'
import type {ImageModelV4CallOptions} from '@ai-sdk/provider'

import {afterEach, describe, expect, test} from 'bun:test'

import {aiEndpointProvider, createAiEndpointModel} from '#src/lib/aiEndpoint.ts'

const originalFetch = globalThis.fetch
const capture = () => {
  const bodies: Array<unknown> = []
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string))
    return Response.json({
      data: [{b64_json: 'AAAA'}],
      choices: [{message: {images: [{image_url: {url: 'data:image/png;base64,AAAA'}}]}}],
    })
  }) as typeof fetch
  return bodies
}
const generate = (id: string, options: Partial<ImageModelV4CallOptions>) => createAiEndpointModel({
  endpoint: 'http://127.0.0.1:8317',
  model: {
    id,
    shortId: id.slice(id.indexOf('/') + 1),
  } as ImageModel,
}).doGenerate({
  prompt: 'A red circle',
  n: 1,
  size: undefined,
  aspectRatio: '16:9',
  seed: undefined,
  files: undefined,
  mask: undefined,
  providerOptions: {},
  ...options,
})
afterEach(() => {
  globalThis.fetch = originalFetch
})
describe('AI endpoint requests', () => {
  test('the GPT Image 2.6 Sunburst hook sends the selected resolution as size', async () => {
    const bodies = capture()
    await generate('openai/gpt-image-2.6-sunburst', {providerOptions: {[aiEndpointProvider]: {
      resolution: '4K',
      quality: 'high',
    }}})
    expect(bodies[0]).toEqual({
      model: 'gpt-image-2.6-sunburst',
      prompt: 'A red circle\n\nAspect ratio: 16:9 (landscape)',
      n: 1,
      response_format: 'b64_json',
      quality: 'high',
      size: '3840x2160',
    })
  })
  test('models without a hook are sent unchanged', async () => {
    const bodies = capture()
    await generate('x-ai/grok-imagine-image-2.0', {providerOptions: {[aiEndpointProvider]: {
      resolution: '2K',
      quality: 'auto',
    }}})
    expect(bodies[0]).toEqual({
      model: 'grok-imagine-image-2.0',
      prompt: 'A red circle',
      n: 1,
      response_format: 'b64_json',
      aspect_ratio: '16:9',
      resolution: '2K',
      quality: 'auto',
    })
  })
  test('the Gemini hook reaches the chat completion body', async () => {
    const bodies = capture()
    await generate('google/gemini-3.1-flash-image', {providerOptions: {[aiEndpointProvider]: {
      resolution: '2K',
      quality: 'minimal',
    }}})
    expect(bodies[0]).toEqual({
      model: 'gemini-3.1-flash-image',
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: 'A red circle',
        }],
      }],
      modalities: ['image', 'text'],
      image_config: {
        aspect_ratio: '16:9',
        image_size: '2K',
      },
      reasoning_effort: 'minimal',
    })
  })
  test('the Muse Image hook sends the frame ratio as size', async () => {
    const bodies = capture()
    await generate('muse-image-1.0', {providerOptions: {[aiEndpointProvider]: {quality: 'low'}}})
    expect(bodies[0]).toEqual({
      model: 'muse-image-1.0',
      prompt: 'A red circle',
      n: 1,
      response_format: 'b64_json',
      size: '1820x1024',
      reasoning_strength: 'low',
    })
  })
})
