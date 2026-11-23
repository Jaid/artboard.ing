import {describe, expect, test} from 'bun:test'

import {getApiKey, hasApiKey, keyless} from '#src/lib/apiKey.ts'
import {getOpenRouterHostTitle, normalizeOpenRouterHost, normalizeOpenRouterKey, openRouterOrigin} from '#src/lib/openRouterAccess.ts'
import queryParameters from '#src/queryParameters.ts'

describe('OpenRouter access', () => {
  test('openrouter_host names the origin serving OpenRouter’s API, a bare host meaning HTTPS', () => {
    expect(normalizeOpenRouterHost(openRouterOrigin)).toBe('https://openrouter.ai')
    expect(normalizeOpenRouterHost('openrouter.nas.lan')).toBe('https://openrouter.nas.lan')
    expect(normalizeOpenRouterHost(' openrouter.nas.lan/ ')).toBe('https://openrouter.nas.lan')
    expect(normalizeOpenRouterHost('localhost:3310')).toBe('https://localhost:3310')
    expect(normalizeOpenRouterHost('http://10.0.0.22:3310/api/v1')).toBe('http://10.0.0.22:3310')
    for (const value of [undefined, '', ' ', 'ftp://example.com', 'exa mple.com', 3310]) {
      expect(normalizeOpenRouterHost(value)).toBe('https://openrouter.ai')
    }
  })
  test('openrouter_key gives a key, false for none at all, and nothing otherwise', () => {
    expect(normalizeOpenRouterKey(undefined)).toBeUndefined()
    expect(normalizeOpenRouterKey('sk-or-v1-test')).toBe('sk-or-v1-test')
    expect(normalizeOpenRouterKey(' sk-or-v1-test ')).toBe('sk-or-v1-test')
    expect(normalizeOpenRouterKey('false')).toBe(false)
    expect(normalizeOpenRouterKey('0')).toBe(false)
    for (const value of ['', ' ', 'true', '1']) {
      expect(normalizeOpenRouterKey(value)).toBeUndefined()
    }
  })
  test('OpenRouter’s own host reads as “OpenRouter”, any other as its host', () => {
    expect(getOpenRouterHostTitle(openRouterOrigin)).toBe('OpenRouter')
    expect(getOpenRouterHostTitle('https://openrouter.nas.lan')).toBe('openrouter.nas.lan')
    expect(getOpenRouterHostTitle('http://10.0.0.22:3310')).toBe('10.0.0.22:3310')
  })
  test('without parameters, requests go to OpenRouter itself and need a key', () => {
    expect(queryParameters.openrouter_host).toBe(openRouterOrigin)
    expect(queryParameters.openrouter_key).toBeUndefined()
    expect(keyless).toBe(false)
    expect(getApiKey()).toBe('')
    expect(hasApiKey()).toBe(false)
  })
})
