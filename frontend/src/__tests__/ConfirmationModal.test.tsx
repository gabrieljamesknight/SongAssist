// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ConfirmationModal from '../components/ConfirmationModal'

describe('ConfirmationModal', () => {
  it('does not render when closed', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const { container } = render(
      <ConfirmationModal
        isOpen={false}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete"
        message="Are you sure?"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders content and handles actions', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmationModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Project"
        message="This cannot be undone"
        confirmButtonText="Delete"
      />
    )

    expect(screen.getByText('Delete Project')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('closes when clicking the backdrop', () => {
    const onClose = vi.fn()
    render(
      <ConfirmationModal
        isOpen
        onClose={onClose}
        onConfirm={() => {}}
        title="Title"
        message="Message"
      />
    )
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })
})

