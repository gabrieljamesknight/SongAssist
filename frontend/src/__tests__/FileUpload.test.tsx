// @vitest-environment jsdom
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileUpload } from '../components/FileUpload'

describe('FileUpload', () => {
  beforeEach(() => {
    // Ensure fetch exists
    // @ts-ignore
    global.fetch = vi.fn()
  })

  it('disables upload button without a file selected', () => {
    render(<FileUpload onUploadSubmit={() => {}} currentUser="alice" />)
    expect(screen.getByRole('button', { name: /separate guitar/i })).toBeDisabled()
  })

  it('uploads file and calls callback with taskId', async () => {
    const onSubmit = vi.fn()
    // Mock fetch
    // @ts-ignore
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ taskId: 'abc123' }) })

    const { container } = render(<FileUpload onUploadSubmit={onSubmit} currentUser="bob" />)

    // Find file input injected by react-dropzone
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['data'], 'track.mp3', { type: 'audio/mpeg' })
    await fireEvent.change(input, { target: { files: [file] } })
    // Wait for UI to reflect selected file
    await screen.findByText('track.mp3')

    fireEvent.click(screen.getByRole('button', { name: /Separate Guitar & Backing Track/i }))

    // Wait for callback to be invoked
    await new Promise(r => setTimeout(r, 0))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(file, 'abc123')
    })
  })
})
