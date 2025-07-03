
import React from 'react';
import { Song } from '../types';
import { PlayIcon, PauseIcon, RewindIcon, FastForwardIcon, BookmarkIcon } from './Icons';

interface PlayerProps {
  song: Song;
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
  pitchShift: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onPitchChange: (pitch: number) => void;
  onAddBookmark: () => void;
  onSongNameChange: (name: string) => void;
  onArtistNameChange: (artist: string) => void;
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

const WaveformPlaceholder: React.FC<{ progress: number }> = ({ progress }) => {
  return (
    <div className="relative h-24 w-full bg-gray-800 rounded-lg overflow-hidden">
      <div className="absolute top-0 left-0 h-full bg-teal-600/30" style={{ width: `${progress}%` }}></div>
      <svg width="100%" height="100%" className="absolute top-0 left-0">
        <path d="M0 48 C 20 12, 40 84, 60 48 S 100 12, 120 48, 160 84, 180 48, 220 12, 240 48, 280 84, 300 48, 340 12, 360 48, 400 84, 420 48, 460 12, 480 48, 520 84, 540 48"
              fill="none" stroke="#64748b" strokeWidth="2" vectorEffect="non-scaling-stroke"
              style={{ width: '100%', height: '96px' }} preserveAspectRatio="none"/>
      </svg>
      <div className="absolute top-0 left-0 h-full w-0.5 bg-teal-400" style={{ left: `${progress}%` }}></div>
    </div>
  );
};


const Player: React.FC<PlayerProps> = ({
  song,
  isPlaying,
  currentTime,
  playbackSpeed,
  pitchShift,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onPitchChange,
  onAddBookmark,
  onSongNameChange,
  onArtistNameChange,
}) => {
  const progress = (currentTime / song.duration) * 100;

  return (
    <div className="bg-gray-800 p-6 rounded-xl shadow-lg space-y-4">
      <div className="space-y-2">
         <input
            type="text"
            value={song.name}
            onChange={(e) => onSongNameChange(e.target.value)}
            aria-label="Song Title"
            className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none focus:bg-gray-900/50 focus:ring-2 focus:ring-teal-500 rounded-lg px-2 py-1 -mx-2 truncate"
        />
        <input
            type="text"
            value={song.artist || ''}
            onChange={(e) => onArtistNameChange(e.target.value)}
            placeholder="Artist Name..."
            aria-label="Artist Name"
            className="w-full bg-transparent text-lg text-gray-400 placeholder-gray-500 focus:outline-none focus:bg-gray-900/50 focus:ring-2 focus:ring-teal-500 rounded-lg px-2 py-1 -mx-2"
        />
      </div>
      
      <WaveformPlaceholder progress={progress} />

      <div className="relative pt-1">
         <input
          type="range"
          min="0"
          max={song.duration}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(song.duration)}</span>
        </div>
      </div>
      
      <div className="flex items-center justify-center space-x-6">
        <button onClick={() => onSeek(Math.max(0, currentTime - 10))} className="text-gray-400 hover:text-white transition"><RewindIcon className="w-6 h-6" /></button>
        <button onClick={onPlayPause} className="bg-teal-500 hover:bg-teal-600 text-white rounded-full w-16 h-16 flex items-center justify-center transition shadow-lg">
          {isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8 pl-1" />}
        </button>
        <button onClick={() => onSeek(Math.min(song.duration, currentTime + 10))} className="text-gray-400 hover:text-white transition"><FastForwardIcon className="w-6 h-6" /></button>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4">
        <div className="w-full sm:w-1/2">
            <label htmlFor="speed" className="block mb-2 text-sm font-medium text-gray-300">Playback Speed: {playbackSpeed.toFixed(2)}x</label>
            <input id="speed" type="range" min="0.5" max="2" step="0.05" value={playbackSpeed} onChange={e => onSpeedChange(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"/>
        </div>
        <div className="w-full sm:w-1/2">
             <label htmlFor="pitch" className="block mb-2 text-sm font-medium text-gray-300">Pitch Shift: {pitchShift >= 0 ? '+' : ''}{pitchShift} semitones</label>
            <input id="pitch" type="range" min="-12" max="12" step="1" value={pitchShift} onChange={e => onPitchChange(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"/>
        </div>
      </div>
      
      <button onClick={onAddBookmark} className="w-full mt-4 bg-teal-500/20 text-teal-300 hover:bg-teal-500/40 font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition">
        <BookmarkIcon className="w-5 h-5" />
        Add Bookmark at {formatTime(currentTime)}
      </button>
    </div>
  );
};

export default Player;