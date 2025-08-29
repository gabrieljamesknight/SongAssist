import React, { useState, useEffect, useCallback } from 'react';
import { Song } from '../types';
import { MarkdownText } from './MarkdownRenderer';
import { EditIcon } from './Icons';

interface ChordAnalysisProps {
  song: Song | null;
  analysisResult: string | null;
  isLoading: boolean;
  error: string | null;
  onAnalyzeChords: () => void;
  onSaveChords: (newContent: string) => Promise<void>;
}

const ChordAnalysis: React.FC<ChordAnalysisProps> = ({ song, analysisResult, isLoading, error, onAnalyzeChords, onSaveChords }) => {
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setEditedContent(analysisResult);
    if (analysisResult !== null) {
        setIsEditing(false);
    }
  }, [analysisResult]);

  const handleAnalyzeChords = () => {
    if (!song) return;

    if (analysisResult && analysisResult.trim().length > 0) {
      const userConfirmed = window.confirm(
        "This will replace the current chord analysis. Are you sure you want to continue?"
      );
      if (!userConfirmed) {
        return;
      }
    }

    onAnalyzeChords();
  };

  const handleSave = async () => {
    if (editedContent === null || !song || !isEditing) return;
    setIsSaving(true);
    try {
      await onSaveChords(editedContent);
      setIsEditing(false);
    } catch (e) {
      // Error is handled in the parent component
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = useCallback(() => {
    setEditedContent(analysisResult);
    setIsEditing(false);
  }, [analysisResult]);

  const isDirty = analysisResult !== null && editedContent !== null && analysisResult !== editedContent;


  if (!song) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <p>Upload a song to analyze its chords.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
       <div className="flex justify-between items-center mb-4 flex-shrink-0">
         <h3 className="text-xl font-bold text-white">Chord Analysis</h3>
         {analysisResult && !isEditing && (
            <button
                onClick={() => setIsEditing(true)}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm flex items-center gap-1"
            >
                <EditIcon className="w-4 h-4" /> Edit
            </button>
         )}
         {isEditing && (
            <div className="flex gap-2">
                <button
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm disabled:bg-gray-500"
                >
                    {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                    Back {/* New: Changed button text from "Cancel" to "Back" */}
                </button>
            </div>
         )}
       </div>
      <div className="flex-grow overflow-y-auto bg-gray-900 rounded-lg p-4 relative group">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-400">Analyzing chords for "{song.name}"...</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-red-400 p-4 bg-red-900/50 rounded-lg">{error}</div>
        ) : analysisResult !== null ? (
          <>
            {isEditing ? (
                <textarea
                    value={editedContent ?? ''}
                    onChange={(e) => setEditedContent(e.target.value)}
                    placeholder="Enter chord analysis here..."
                    className="w-full h-full bg-transparent focus:outline-none resize-none text-sm text-gray-300 whitespace-pre-wrap"
                />
            ) : (
                <MarkdownText text={analysisResult} />
            )}
             {!isEditing && analysisResult && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/80 text-white text-xs px-2 py-1 rounded">
                    Click "Edit" to modify
                </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
             <p className="text-gray-500">Click the button below to analyze chords.</p>
          </div>
        )}
      </div>
      <p className="text-xs text-center text-gray-500 mt-3">
        AI-generated analysis may be inaccurate.
      </p>
       <button
        onClick={handleAnalyzeChords}
        disabled={isLoading || isSaving || isEditing}
        className="w-full mt-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Analyzing...' : `Analyze Chords for "${song.name}"`}
      </button>
    </div>
  );
};

export default ChordAnalysis;