import React from 'react';

// Shows text and turns double-asterisked text into bold using <strong> tags.
export const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const parts = text.split(/(\*\*[\s\S]*?\*\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        // Filter out empty strings 
        if (part === '') return null;

        if (part.startsWith('**') && part.endsWith('**')) {
          // Bold
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        // Normal
        return part;
      })}
    </>
  );
};

