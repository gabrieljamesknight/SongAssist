// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'

class FakeGain {
  gain = { setTargetAtTime: vi.fn(), value: 1 }
  connect() {}
}
class FakeSource {
  buffer: any = null
  playbackRate = { value: 1 }
  onended: ((this: any) => void) | null = null
  connect() {}
  start = vi.fn()
  stop = vi.fn()
}
class FakeAudioContext {
  state: 'running' | 'suspended' = 'running'
  currentTime = 0
  destination = {}
  createGain() { return new FakeGain() as any }
  createBufferSource() { return new FakeSource() as any }
  resume = vi.fn(async () => { this.state = 'running' })
  close = vi.fn(async () => {})
  async decodeAudioData(_: ArrayBuffer) { return { duration: 120 } as any }
}

describe('useAudioPlayer', () => {
  beforeEach(() => {
    // @ts-ignore
    window.AudioContext = FakeAudioContext as any
    // @ts-ignore
    window.webkitAudioContext = FakeAudioContext as any
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  })

  const Harness: React.FC = () => {
    const p = useAudioPlayer({ loop: null, isLooping: false })
    return (
      <div>
        <div data-testid="songName">{p.song?.name ?? 'none'}</div>
        <div data-testid="isPlaying">{String(p.isPlaying)}</div>
        <div data-testid="currentTime">{p.currentTime.toFixed(1)}</div>
        <button onClick={() => p.load({ guitar: 'g', backingTrack: 'b' }, { name: 'N', artist: 'A' })}>load</button>
        <button onClick={() => p.play()}>play</button>
        <button onClick={() => p.pause()}>pause</button>
        <button onClick={() => p.seek(10)}>seek</button>
      </div>
    )
  }

  it('loads song and controls basic actions', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('load'))
    // Wait for song to be populated
    await screen.findByText('N')
    expect(screen.getByTestId('songName')).toHaveTextContent('N')

    fireEvent.click(screen.getByText('play'))
    expect(screen.getByTestId('isPlaying')).toHaveTextContent('true')

    fireEvent.click(screen.getByText('seek'))
    expect(screen.getByTestId('currentTime')).toHaveTextContent('10.0')

    fireEvent.click(screen.getByText('pause'))
    expect(screen.getByTestId('isPlaying')).toHaveTextContent('false')
  })
})

