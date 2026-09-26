import { describe, expect, it } from 'vitest'
import { platformOf } from './install'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  // iPadOS asks for desktop sites, so it looks like a Mac apart from its touch screen.
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
}

describe('platformOf', () => {
  it('sends every iPhone and iPad browser to the Share menu', () => {
    expect(platformOf(UA.iphoneSafari, 5)).toBe('ios')
    expect(platformOf(UA.iphoneChrome, 5)).toBe('ios')
    expect(platformOf(UA.ipad, 5)).toBe('ios')
  })

  it('tells Safari on a Mac apart from other Mac browsers', () => {
    expect(platformOf(UA.macSafari, 0)).toBe('mac-safari')
    expect(platformOf(UA.macChrome, 0)).toBe('other')
    expect(platformOf(UA.macFirefox, 0)).toBe('other')
  })

  it('leaves Android to the browser’s own prompt', () => {
    expect(platformOf(UA.androidChrome, 5)).toBe('other')
  })
})
