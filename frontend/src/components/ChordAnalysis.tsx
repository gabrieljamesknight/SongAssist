import React from 'react';
import { Song } from '../types';
import { MarkdownText } from './MarkdownRenderer';

interface ChordAnalysisProps {
  song: Song | null;
  analysisResult: string | null;
  isLoading: boolean;
  error: string | null;
  onAnalyzeChords: () => void;
}

const ChordAnalysis: React.FC<ChordAnalysisProps> = ({ song, analysisResult, isLoading, error, onAnalyzeChords }) => {

  const handleAnalyzeChords = () => {
    if (!song) return;
    onAnalyzeChords();
  };

  if (!song) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <p>Upload a song to analyze its chords.</p> // Changed: Updated text
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
       <h3 className="text-xl font-bold text-white mb-4 flex-shrink-0">Chord Analysis</h3>
      <div className="flex-grow overflow-y-auto bg-gray-900 rounded-lg p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-400">Analyzing chords for "{song.name}"...</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-red-400 p-4 bg-red-900/50 rounded-lg">{error}</div>
        ) : analysisResult ? (
          <div className="text-sm text-gray-300 whitespace-pre-wrap"><MarkdownText text={analysisResult} /></div>
        ) : (
          <div className="flex items-center justify-center h-full">
             <p className="text-gray-500">Click the button below to analyze chords.</p>
          </div>
        )}
      </div>
       <button
        onClick={handleAnalyzeChords}
        disabled={isLoading}
        className="w-full mt-4 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Analyzing...' : `Analyze Chords for "${song.name}"`}
      </button>
    </div>
  );
};

export default ChordAnalysis;