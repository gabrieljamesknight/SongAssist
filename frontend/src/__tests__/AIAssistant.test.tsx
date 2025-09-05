// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AIAssistant } from '../components/AIAssistant'

describe('AIAssistant', () => {
  it('shows empty state hint', () => {
    render(
      <AIAssistant song={null} messages={[]} isLoading={false} onSendMessage={() => {}} />
    )
    expect(screen.getByText('Ask a question to get started.')).toBeInTheDocument()
  })

  it('sends quick question and form message', () => {
    const onSend = vi.fn()
    render(
      <AIAssistant song={{ name: 'S', artist: 'A', duration: 10, artistConfirmed: true }} messages={[]} isLoading={false} onSendMessage={onSend} />
    )

    fireEvent.click(screen.getByText('How do I replicate the technique?'))
    expect(onSend).toHaveBeenCalled()

    const input = screen.getByPlaceholderText('Ask a question...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Hello')
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('disables interactions while loading', () => {
    const onSend = vi.fn()
    render(
      <AIAssistant song={{ name: 'S', artist: 'A', duration: 10, artistConfirmed: true }} messages={[]} isLoading={true} onSendMessage={onSend} />
    )
    expect(screen.getByPlaceholderText('Ask a question...')).toBeDisabled()
    fireEvent.click(screen.getByText('How should I approach learning this?'))
    expect(onSend).not.toHaveBeenCalled()
  })
})

