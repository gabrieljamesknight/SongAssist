import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatChordAnalysis,
  identifySongFromFileName,
  getInitialSongAnalysis,
  getPlayingAdvice,
  analyzeChordsFromStem,
  saveChordAnalysis,
} from '../services/geminiService'



beforeEach(() => {
  ;(import.meta as any).env = { VITE_API_BASE: 'http://api.test' }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('formatChordAnalysis', () => {
  it('formats sections and notes', () => {
    const text = formatChordAnalysis({
      tuning: 'E Standard',
      key: 'G Major',
      difficulty: 3,
      sections: [
        { name: 'Intro', chords: 'G D\nHello world' },
        { name: 'Chorus', chords: 'C G\nLa la' },
      ],
      notes: 'Strum gently.',
    })
    expect(text).toContain('### AI Analysis')
    expect(text).toContain('**Tuning:** E Standard')
    expect(text).toContain('### Chord Progression')
    expect(text).toContain('**Intro**')
    expect(text).toContain('```')
    expect(text).toContain('Strum gently.')
  })
})

describe('API helpers', () => {
  it('identifySongFromFileName returns JSON on 200', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ songTitle: 'X', artist: 'Y' }) }) as any
    const out = await identifySongFromFileName('x.mp3')
    expect(out).toEqual({ songTitle: 'X', artist: 'Y' })
    expect((globalThis as any).fetch).toHaveBeenCalled()
    const [url, init] = ((globalThis as any).fetch as any).mock.calls[0]
    expect(String(url)).toMatch(/\/gemini\/identify-from-filename$/)
    expect(init).toEqual(expect.objectContaining({ method: 'POST' }))
  })

  it('identifySongFromFileName returns null on non-ok', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any
    const out = await identifySongFromFileName('x.mp3')
    expect(out).toBeNull()
  })

  it('getInitialSongAnalysis handles empty title', async () => {
    const out = await getInitialSongAnalysis('', 'A')
    expect(out).toBe('UNKNOWN_SONG')
  })

  it('getInitialSongAnalysis returns text field', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'Hello' }) }) as any
    const out = await getInitialSongAnalysis('Song', 'Artist')
    expect(out).toBe('Hello')
  })

  it('getPlayingAdvice returns fallback on non-ok', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any
    const out = await getPlayingAdvice({ songTitle: 'S' })
    expect(out).toContain("couldn't generate advice")
  })

  it('analyzeChordsFromStem returns formatted analysis on success', async () => {
    const server = {
      ok: true,
      json: async () => ({ ok: true, result: { tuning: 'E', key: 'C', sections: [] } }),
    }
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue(server as any)
    const text = await analyzeChordsFromStem('u', 't', 'Song', 'Artist')
    expect(text).toContain('### AI Analysis')
  })

  it('analyzeChordsFromStem throws on server error', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' }) as any
    await expect(analyzeChordsFromStem('u', 't', 'Song', 'Artist')).rejects.toThrow()
  })

  it('saveChordAnalysis throws on non-ok', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' }) as any
    await expect(saveChordAnalysis('u', 't', '# x')).rejects.toThrow()
  })
})
