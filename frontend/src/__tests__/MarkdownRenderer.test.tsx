// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MarkdownText } from '../components/MarkdownRenderer'

describe('MarkdownRenderer', () => {
  it('renders headings, bold text and code blocks', () => {
    const md = `### Title\nNormal **bold** text\n\n\`\`\`\ncode line\n\`\`\``
    render(<MarkdownText text={md} />)
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('code line')).toBeInTheDocument()
  })
})

