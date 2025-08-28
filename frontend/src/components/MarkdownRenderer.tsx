import type { FC, ReactNode } from 'react';

const parseInlineMarkdown = (text: string): ReactNode[] => {
  const parts = text.split(/(\*\*[\s\S]*?\*\*)/g);

  return parts.map((part, index) => {
    // Filter out empty strings 
    if (part === '') return null;

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    // Normal
    return part;
  });
};

export const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  lines.forEach((line, index) => {
    if (line.trim() === '```') {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${index}`} className="bg-gray-900 p-3 rounded-md text-sm font-mono whitespace-pre-wrap my-2">
            {codeBlockContent.join('\n')}
          </pre>
        );
        codeBlockContent = []; // Reset for the next block.
      }
      inCodeBlock = !inCodeBlock; // Toggle the state.
      return; // Skip rendering the ``` line itself.
    }

    if (inCodeBlock) {
      // comment: If inside a code block, collect the line.
      codeBlockContent.push(line);
    } else {
      // comment: If not in a code block, parse for headings or regular text.
      const headingMatch = line.match(/^(#{1,6})\s(.*)/);
      if (headingMatch) {
        const content = headingMatch[2];
        elements.push(
          <div key={index} className="font-bold text-base mt-3 mb-1">
            {parseInlineMarkdown(content)}
          </div>
        );
      } else if (line.trim() !== '') {
        // Render a standard line of text.
        elements.push(
          <div key={index}>
            {parseInlineMarkdown(line)}
          </div>
        );
      }
    }
  });

  // Render any remaining code block content if the text ends unexpectedly.
  if (codeBlockContent.length > 0) {
    elements.push(
      <pre key="code-final" className="bg-gray-900 p-3 rounded-md text-sm font-mono whitespace-pre-wrap my-2">
        {codeBlockContent.join('\n')}
      </pre>
    );
  }

  return <>{elements}</>;
};