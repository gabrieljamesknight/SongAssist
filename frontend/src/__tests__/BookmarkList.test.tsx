// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import BookmarkList from '../components/BookmarkList'

describe('BookmarkList', () => {
  it('shows empty state', () => {
    render(
      <BookmarkList bookmarks={[]} onDeleteBookmark={() => {}} onUpdateBookmarkLabel={() => {}} onGoToBookmark={() => {}} />
    )
    expect(screen.getByText('No saved loops.')).toBeInTheDocument()
  })

  it('renders bookmarks sorted and invokes handlers', () => {
    const onDelete = vi.fn()
    const onUpdate = vi.fn()
    const onGo = vi.fn()
    const bookmarks = [
      { id: 2, start: 12, end: 20, label: 'Later' },
      { id: 1, start: 2, end: 8, label: 'Early' },
    ]
    render(
      <BookmarkList bookmarks={bookmarks} onDeleteBookmark={onDelete} onUpdateBookmarkLabel={onUpdate} onGoToBookmark={onGo} />
    )

    // First visible is earlier one
    expect(screen.getByText('0:02 - 0:08')).toBeInTheDocument()
    fireEvent.click(screen.getByText('0:02 - 0:08'))
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))

    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: 'New Label' } })
    expect(onUpdate).toHaveBeenCalledWith(1, 'New Label')

    const deleteButtons = screen.getAllByRole('button')
    // Last button in the first row is the delete button
    fireEvent.click(deleteButtons[deleteButtons.length - 1])
    expect(onDelete).toHaveBeenCalled()
  })
})

