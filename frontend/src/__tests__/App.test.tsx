// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import App from '../App'
import { AudioPlayerProvider } from '../contexts/AudioPlayerContext'

// Mock the audio player hook to avoid Web Audio
vi.mock('../hooks/useAudioPlayer', () => {
  return {
    useAudioPlayer: () => ({
      song: null,
      isPlaying: false,
      currentTime: 0,
      isLoading: false,
      error: null,
      stemVolumes: { guitar: 100, backingTrack: 100 },
      playbackSpeed: 1,
      load: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      setStemVolumes: vi.fn(),
      setPlaybackSpeed: vi.fn(),
      setSong: vi.fn(),
    }),
  }
})

describe('App (smoke)', () => {
  beforeEach(() => {
    // Provide API base env
    ;(import.meta as any).env = { VITE_API_BASE: 'http://api.test' }
    // Mock network calls
    // @ts-ignore
    global.fetch = vi.fn(async (url: string, init?: any) => {
      if (String(url).includes('/login')) {
        return { ok: true, json: async () => ({ ok: true }) } as any
      }
      if (String(url).includes('/user/') && String(url).includes('/projects')) {
        return { ok: true, json: async () => ({ projects: [] }) } as any
      }
      return { ok: true, json: async () => ({}) } as any
    })
  })

  it('shows login then project area after success', async () => {
    render(
      <AudioPlayerProvider>
        <App />
      </AudioPlayerProvider>
    )

    expect(screen.getByText('Welcome to SongAssist')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('e.g., your-name'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(screen.getByText('Separate Guitar & Backing Track')).toBeInTheDocument()
      expect(screen.getByText('No Projects Found')).toBeInTheDocument()
    })
  })
})

