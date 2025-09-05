// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ChordAnalysis from '../components/ChordAnalysis'

const song = { name: 'Song X', artist: 'A', duration: 100, artistConfirmed: true }

describe('ChordAnalysis', () => {
  it('prompts when no song loaded', () => {
    render(
      <ChordAnalysis song={null} analysisResult={null} isLoading={false} error={null} onAnalyzeChords={() => {}} onSaveChords={async () => {}} />
    )
    expect(screen.getByText('Upload a song to analyze its chords.')).toBeInTheDocument()
  })

  it('renders analyze button and calls handler', () => {
    const onAnalyze = vi.fn()
    render(
      <ChordAnalysis song={song} analysisResult={null} isLoading={false} error={null} onAnalyzeChords={onAnalyze} onSaveChords={async () => {}} />
    )
    const btn = screen.getByRole('button', { name: /Analyze Chords for/ })
    fireEvent.click(btn)
    expect(onAnalyze).toHaveBeenCalled()
  })

  it('allows editing and saving analysis', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <ChordAnalysis song={song} analysisResult={'### AI Analysis\nHello'} isLoading={false} error={null} onAnalyzeChords={() => {}} onSaveChords={onSave} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Changed text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith('Changed text')
  })
})

