// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { AudioPlayerProvider, useAudioPlayerContext } from '../contexts/AudioPlayerContext'

// Mock useAudioPlayer to avoid Web Audio API
const seekMock = vi.fn()
vi.mock('../hooks/useAudioPlayer', () => {
  return {
    useAudioPlayer: () => ({
      song: { name: 'S', artist: 'A', duration: 100, artistConfirmed: true },
      isPlaying: false,
      currentTime: 0,
      isLoading: false,
      error: null,
      stemVolumes: { guitar: 100, backingTrack: 100 },
      playbackSpeed: 1,
      load: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      seek: seekMock,
      setStemVolumes: vi.fn(),
      setPlaybackSpeed: vi.fn(),
      setSong: vi.fn(),
    }),
  }
})

const Probe: React.FC = () => {
  const ctx = useAudioPlayerContext()
  return (
    <div>
      <div data-testid="isLooping">{String(ctx.isLooping)}</div>
      <div data-testid="loopStart">{ctx.loop ? ctx.loop.start.toFixed(2) : 'null'}</div>
      <div data-testid="loopEnd">{ctx.loop ? ctx.loop.end.toFixed(2) : 'null'}</div>
      <button onClick={ctx.onToggleLoop}>toggle</button>
    </div>
  )
}

describe('AudioPlayerContext', () => {
  it('throws if used outside provider', () => {
    const Spy: React.FC = () => {
      expect(() => useAudioPlayerContext()).toThrow()
      return null
    }
    render(<Spy />)
  })

  it('creates and toggles loops, calling seek', () => {
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>
    )

    // Initially not looping
    expect(screen.getByTestId('isLooping')).toHaveTextContent('false')
    fireEvent.click(screen.getByText('toggle'))

    // Now looping with an auto-created loop ~ around center +-5s
    expect(screen.getByTestId('isLooping')).toHaveTextContent('true')
    const start = parseFloat(screen.getByTestId('loopStart').textContent || '0')
    const end = parseFloat(screen.getByTestId('loopEnd').textContent || '0')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    expect(seekMock).toHaveBeenCalledWith(start)

    // Toggle off stores savedLoop and clears active loop
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('isLooping')).toHaveTextContent('false')
    expect(screen.getByTestId('loopStart')).toHaveTextContent('null')

    // Toggle on restores savedLoop and seeks
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('isLooping')).toHaveTextContent('true')
    expect(seekMock).toHaveBeenCalled()
  })
})

