// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectList } from '../components/ProjectList'

describe('ProjectList', () => {
  it('shows empty state', () => {
    render(<ProjectList projects={[]} onLoadProject={() => {}} onDeleteProject={() => {}} />)
    expect(screen.getByText('No Projects Found')).toBeInTheDocument()
  })

  it('loads a project when clicked', () => {
    const onLoad = vi.fn()
    const onDelete = vi.fn()
    const projects = [
      { taskId: '1', originalFileName: 'Song A', manifestUrl: 'http://api/manifest/a' },
      { taskId: '2', originalFileName: 'Song B', manifestUrl: 'http://api/manifest/b' },
    ]
    render(<ProjectList projects={projects} onLoadProject={onLoad} onDeleteProject={onDelete} />)

    fireEvent.click(screen.getByText('Song A'))
    expect(onLoad).toHaveBeenCalledWith('http://api/manifest/a')
  })

  it('delete button triggers onDeleteProject and does not load', () => {
    const onLoad = vi.fn()
    const onDelete = vi.fn()
    const projects = [
      { taskId: '1', originalFileName: 'Song A', manifestUrl: 'http://api/manifest/a' },
    ]
    render(<ProjectList projects={projects} onLoadProject={onLoad} onDeleteProject={onDelete} />)

    fireEvent.click(screen.getByLabelText('Delete project Song A'))
    expect(onDelete).toHaveBeenCalledWith('1')
    expect(onLoad).not.toHaveBeenCalled()
  })
})

