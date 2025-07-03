
import React, { useState, useRef, useEffect } from 'react';
import { getPlayingAdvice } from '../services/geminiService';
import { ChatMessage, Song } from '../types';
import { BotIcon } from './Icons';

interface AIAssistantProps {
  song: Song | null;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ song }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading || !song) return;

    const userMessage: ChatMessage = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);

    const advice = await getPlayingAdvice(song.name, song.artist, query);
    const modelMessage: ChatMessage = { role: 'model', content: advice };
    setMessages(prev => [...prev, modelMessage]);
    setIsLoading(false);
  };

  if (!song) {
    return (
       <div className="h-full flex items-center justify-center text-gray-500">
        <p>Upload a song to get playing advice.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xl font-bold text-white mb-4 flex-shrink-0">AI Assistant</h3>
      <div className="flex-grow overflow-y-auto pr-2 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0 mt-1"><BotIcon className="w-5 h-5 text-white"/></div>}
            <div className={`p-3 rounded-lg max-w-sm md:max-w-md lg:max-w-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
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

export default AIAssistant;