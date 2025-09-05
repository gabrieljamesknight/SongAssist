import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage, Song } from '../types';
import { MarkdownText } from './MarkdownRenderer';
import { SparklesIcon } from './Icons';

interface AIAssistantProps {
  song: Song | null;
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ song, messages, isLoading, onSendMessage }) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [quickPrompts, setQuickPrompts] = useState<{ label: string; prompt: string }[]>([
    {
      label: 'How do I replicate the technique?',
      prompt: 'How can I replicate the technique used in this song?'
    },
    {
      label: 'How should I approach learning this?',
      prompt: 'How should I approach learning this?'
    }
  ]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleQuickQuestion = (question: string) => {
    if (!isLoading) {
      onSendMessage(question);
      setQuickPrompts((prev) => prev.filter((qp) => qp.prompt !== question));
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('message-input') as HTMLInputElement;
    const message = input.value.trim();
    if (message && !isLoading) {
      onSendMessage(message);
      input.value = '';
    }
  };

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xl font-bold text-white mb-4 flex-shrink-0">AI Assistant</h3>
      <div className="flex-grow overflow-y-auto bg-gray-900 rounded-lg p-4 custom-scrollbar space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div className="text-gray-500">
              <SparklesIcon className="mx-auto h-12 w-12 text-teal-400" />
              <p className="mt-2">Ask a question to get started.</p>
            </div>
          </div>
        )}
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-xl max-w-[80%] whitespace-pre-wrap ${
              msg.role === 'user' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-200'
            }`}>
              <MarkdownText text={msg.content} />
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 text-gray-200 p-3 rounded-xl">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-fast"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-delay"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-fast"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="flex-shrink-0 mt-4 space-y-2">
        {quickPrompts.map(({ label, prompt }) => (
          <button
            key={prompt}
            onClick={() => handleQuickQuestion(prompt)}
            disabled={isLoading}
            className="w-full bg-gray-700 hover:bg-teal-800/60 text-sm text-white py-2 px-3 rounded-lg transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {label}
          </button>
        ))}
      </div>
      
      <form onSubmit={handleFormSubmit} className="mt-4 flex flex-shrink-0">
        <input
          type="text"
          name="message-input"
          placeholder="Ask a question..."
          className="flex-grow bg-gray-700 text-white rounded-l-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-r-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          Send
        </button>
      </form>
    </div>
  );
};