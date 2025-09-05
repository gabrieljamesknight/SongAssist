// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Player from '../components/Player'
import type { Song } from '../types'

// Mock JSZip to avoid heavy work in tests
vi.mock('jszip', () => {
  return {
    default: class MockZip {
      file() {}
      async generateAsync() {
        return new Blob(['zip'], { type: 'application/zip' })
      }
    }
  }
})

describe('Player', () => {
  const baseSong: Song = {
    name: 'Test Song',
    artist: 'Artist',
    duration: 120,
    artistConfirmed: true,
    stemUrls: {
      guitar: 'https://example.com/guitar.mp3',
      backingTrack: 'https://example.com/backing.mp3',
    },
  }

  beforeEach(() => {
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })
  })

  it('invokes primary controls and metadata handlers', () => {
    const onPlayPause = vi.fn()
    const onSeek = vi.fn()
    const onSpeedChange = vi.fn()
    const onAddBookmark = vi.fn()
    const onSongNameChange = vi.fn()
    const onArtistNameChange = vi.fn()
    const onLoopChange = vi.fn()
    const onToggleLoop = vi.fn()

    render(
      <Player
        song={baseSong}
        isPlaying={false}
        currentTime={20}
        playbackSpeed={1}
        loop={null}
        isLooping={false}
        allowLoopCreation={false}
        onPlayPause={onPlayPause}
        onSeek={onSeek}
        onSpeedChange={onSpeedChange}
        onAddBookmark={onAddBookmark}
        onSongNameChange={onSongNameChange}
        onArtistNameChange={onArtistNameChange}
        onLoopChange={onLoopChange}
        onToggleLoop={onToggleLoop}
      />
    )

    // Toggle play
    fireEvent.click(screen.getByRole('button', { name: /toggle loop/i }))
    expect(onToggleLoop).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /increase playback speed/i }))
    expect(onSpeedChange).toHaveBeenCalledWith(1.1)

    fireEvent.click(screen.getByRole('button', { name: /decrease playback speed/i }))
    expect(onSpeedChange).toHaveBeenCalled()

    // Main play/pause button (third control button)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[2])
    expect(onPlayPause).toHaveBeenCalled()

    // Seek backward / forward
    // Use order to click the first and third around play button
    
    // buttons order: toggle loop, rewind, main play, forward, download menu, speed controls...
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[3])
    expect(onSeek).toHaveBeenCalled()

    // Metadata inputs
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: 'New Song' } })
    expect(onSongNameChange).toHaveBeenCalledWith('New Song')
    fireEvent.change(inputs[1], { target: { value: 'New Artist' } })
    expect(onArtistNameChange).toHaveBeenCalledWith('New Artist')
  })

  it('opens download menu and closes after selection', async () => {
    render(
      <Player
        song={baseSong}
        isPlaying={false}
        currentTime={0}
        playbackSpeed={1}
        loop={null}
        isLooping={false}
        allowLoopCreation={false}
        onPlayPause={() => {}}
        onSeek={() => {}}
        onSpeedChange={() => {}}
        onAddBookmark={() => {}}
        onSongNameChange={() => {}}
        onArtistNameChange={() => {}}
        onLoopChange={() => {}}
        onToggleLoop={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /download stems/i }))
    expect(screen.getByText('Guitar')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Guitar'))

    await waitFor(() => {
      expect(screen.queryByText('Guitar')).not.toBeInTheDocument()
    })

    // Test zip both path
    fireEvent.click(screen.getByRole('button', { name: /download stems/i }))
    fireEvent.click(screen.getByText('Both Files (.zip)'))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
  })
})
