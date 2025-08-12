import { useState, useRef, useEffect, FC, FormEvent } from 'react';
import { ChatMessage, Song } from '../types';
import { BotIcon } from './Icons';
import { MarkdownText } from './MarkdownRenderer';

interface AIAssistantProps {
  song: Song | null;
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (query: string) => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ song, messages, isLoading, onSendMessage }) => {
  const [query, setQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading || !song) return;
    onSendMessage(query);
    setQuery('');
  };

  if (!song) {
    return (
       <div className="h-full flex items-center justify-center text-gray-500">
        <p>Upload a song to get playing advice.</p>
      </div>
    )
  }
  
  const showInitialLoading = isLoading && messages.length === 0;
  const showTypingIndicator = isLoading && messages.length > 0;

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xl font-bold text-white mb-4 flex-shrink-0">AI Assistant</h3>
      <div className="flex-grow overflow-y-auto pr-2 space-y-4">
        {showInitialLoading ? (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-400">Analyzing song...</p>
                </div>
            </div>
        ) : (
            messages.map((msg, index) => (
                <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0 mt-1"><BotIcon className="w-5 h-5 text-white"/></div>}
                    <div className={`p-3 rounded-lg max-w-sm md:max-w-md lg:max-w-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}>
                        <div className="whitespace-pre-wrap">
                            {msg.role === 'model' ? <MarkdownText text={msg.content} /> : msg.content}
                        </div>
                    </div>
                </div>
            ))
        )}

        {showTypingIndicator && (
            <div className="flex items-start gap-3">
                 <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0 mt-1"><BotIcon className="w-5 h-5 text-white"/></div>
                 <div className="p-3 rounded-lg bg-gray-700">
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-teal-300 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-teal-300 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-teal-300 rounded-full animate-pulse"></div>
                    </div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex-shrink-0">
        <div className="flex rounded-lg shadow-sm">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask for advice, e.g., 'How to play the chorus?'"
            className="flex-1 block w-full rounded-l-md bg-gray-700 border-gray-600 text-white focus:ring-teal-500 focus:border-teal-500 p-3"
            disabled={isLoading || !song}
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim() || !song}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 focus:ring-offset-gray-800 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};
