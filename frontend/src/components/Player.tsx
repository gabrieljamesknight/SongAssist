import { FC, memo, useRef, useEffect, useState } from 'react';
import { Song } from '../types';
import { PlayIcon, PauseIcon, RewindIcon, FastForwardIcon, BookmarkIcon } from './Icons';
import JSZip from 'jszip'; // Added: Import JSZip for client-side file zipping.

interface PlayerProps {
  song: Song;
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
  loop: { start: number; end: number } | null;
  isLooping: boolean;
  allowLoopCreation: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onAddBookmark: () => void;
  onSongNameChange: (name: string) => void;
  onArtistNameChange: (artist: string) => void;
  onLoopChange: (loop: { start: number; end: number } | null) => void;
  onToggleLoop: () => void;
}

const LoopIcon: FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17 2.1l4 4-4 4"/>
    <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8"/>
    <path d="M7 21.9l-4-4 4-4"/>
    <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2"/>
  </svg>
);

const DownloadIcon: FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

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
  loop,
  isLooping,
  allowLoopCreation,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onAddBookmark,
  onSongNameChange,
  onArtistNameChange,
  onLoopChange,
  onToggleLoop,
}) => {
  const progress = (currentTime / song.duration) * 100;
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    type: 'start' | 'end' | 'new' | 'seek';
    initialTime: number;
    initialClientX: number;
  } | null>(null);
  const [isDownloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [isZipping, setIsZipping] = useState(false);


  const calculateTimeFromEvent = (e: MouseEvent | React.MouseEvent): number => {
    if (!sliderContainerRef.current) return 0;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return percentage * song.duration;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!sliderContainerRef.current) return;
    const time = calculateTimeFromEvent(e);

    let dragType: 'start' | 'end' | 'new' | 'seek';

    if (loop) {
      const distToStart = Math.abs(time - loop.start);
      const distToEnd = Math.abs(time - loop.end);
      dragType = distToStart < distToEnd ? 'start' : 'end';
    } else if (allowLoopCreation) {
      dragType = 'new';
    } else {
      dragType = 'seek';
    }
    
    dragStateRef.current = { isDragging: true, initialTime: time, type: dragType, initialClientX: e.clientX };
  };
  
  useEffect(() => {
    if (!isDownloadMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDownloadMenuOpen]);


  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current?.isDragging) return;
      const currentTime = calculateTimeFromEvent(e);
      const minLoopDuration = 2; 

      switch (dragStateRef.current.type) {
        case 'new':
          onLoopChange({ start: Math.min(dragStateRef.current.initialTime, currentTime), end: Math.max(dragStateRef.current.initialTime, currentTime) });
          break;
        case 'start':
          if (loop) onLoopChange({ start: Math.min(currentTime, loop.end - minLoopDuration), end: loop.end }); 
          break;
        case 'end':
          if (loop) onLoopChange({ start: loop.start, end: Math.max(currentTime, loop.start + minLoopDuration) });
          break;
        case 'seek':
          onSeek(currentTime);
          break;
      }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStateRef.current?.isDragging) return;
      
      const wasSimpleClick = Math.abs(e.clientX - dragStateRef.current.initialClientX) < 5;
      const time = calculateTimeFromEvent(e);

      if (wasSimpleClick) {
        if (loop) {
          const distToStart = Math.abs(time - loop.start);
          const distToEnd = Math.abs(time - loop.end);
          const minLoopDuration = 2;

          if (distToStart < distToEnd) {
            const newStart = Math.min(time, loop.end - minLoopDuration);
            onLoopChange({ start: newStart, end: loop.end });
          } else {
            const newEnd = Math.max(time, loop.start + minLoopDuration);
            onLoopChange({ start: loop.start, end: newEnd });
          }
        } else {
          onSeek(time);
        }
      } else {
        if (loop && loop.end - loop.start < 2) { 
          onLoopChange(null);
        }
        if (dragStateRef.current.type === 'new') {
          const finalTime = calculateTimeFromEvent(e);
          const loopStart = Math.min(dragStateRef.current.initialTime, finalTime);
          onSeek(loopStart);
        }
      }
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [loop, onLoopChange, onSeek, song.duration]);
  
  const handleDownload = (stem: 'guitar' | 'backingTrack') => {
    if (!song.stemUrls) return;
    const url = song.stemUrls[stem];
    const isBacking = stem === 'backingTrack';
    const stemName = isBacking ? 'no_guitar' : 'guitar';

    if (!url) return;
    
    const fileExtension = url.split('?')[0].split('.').pop() || 'mp3';
    const safeSongName = song.name.replace(/[^a-z0-9_ -]/gi, '_').substring(0, 50);
    const fileName = `${safeSongName}_${stemName}.${fileExtension}`;

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadMenuOpen(false);
  };
  
  // Zips and downloads both stems
  const handleDownloadBoth = async () => {
    if (!song.stemUrls?.guitar || !song.stemUrls?.backingTrack) return;
    
    setIsZipping(true);
    setDownloadMenuOpen(false);

    try {
      const zip = new JSZip();
      const urlsToFetch = [
        { key: 'guitar', url: song.stemUrls.guitar },
        { key: 'backingTrack', url: song.stemUrls.backingTrack },
      ];

      const filePromises = urlsToFetch.map(async (fileInfo) => {
        const response = await fetch(fileInfo.url);
        if (!response.ok) throw new Error(`Failed to fetch ${fileInfo.key}`);
        const blob = await response.blob();
        
        const stemName = fileInfo.key === 'backingTrack' ? 'no_guitar' : 'guitar';
        const fileExtension = fileInfo.url.split('?')[0].split('.').pop() || 'mp3';
        const safeSongName = song.name.replace(/[^a-z0-9_ -]/gi, '_').substring(0, 50);
        const fileName = `${safeSongName}_${stemName}.${fileExtension}`;
        
        zip.file(fileName, blob);
      });

      await Promise.all(filePromises);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const safeSongName = song.name.replace(/[^a-z0-9_ -]/gi, '_').substring(0, 50);
      const zipFileName = `${safeSongName}_stems.zip`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.setAttribute('download', zipFileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

    } catch (error) {
      console.error("Failed to create or download zip file:", error);
    } finally {
      setIsZipping(false);
    }
  };

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
        <div ref={sliderContainerRef} className="relative h-8 -my-3 group cursor-pointer" onMouseDown={handleMouseDown}>
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 bg-gray-700 rounded-lg transition-all duration-200 group-hover:h-3 z-0"></div>
          
          {loop && (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2 group-hover:h-3 bg-purple-500/20 border-y-2 border-purple-500 z-20"
              style={{
                left: `${(loop.start / song.duration) * 100}%`,
                width: `${((loop.end - loop.start) / song.duration) * 100}%`,
              }}
            >
              <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-purple-300 rounded-full border-2 border-gray-800 cursor-ew-resize transition-transform duration-200 group-hover:scale-125" />
              <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-purple-300 rounded-full border-2 border-gray-800 cursor-ew-resize transition-transform duration-200 group-hover:scale-125" />
            </div>
          )}

          <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-teal-600 rounded-lg transition-all duration-200 group-hover:h-3 z-10" style={{ width: `${progress}%` }}></div>
          <div className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-full transition-transform duration-200 group-hover:scale-x-150 group-hover:scale-y-125 z-30" style={{ left: `${progress}%` }}></div>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-4">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(song.duration)}</span>
        </div>
      </div>
      
      <div className="flex items-center justify-center space-x-4 sm:space-x-6">
        <button onClick={onToggleLoop} className={`p-2 rounded-full transition ${isLooping && loop ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400 hover:text-white'}`} aria-label="Toggle loop">
            <LoopIcon className="w-6 h-6" />
        </button>
        <button onClick={() => onSeek(Math.max(0, currentTime - 10))} className="text-gray-400 hover:text-white transition"><RewindIcon className="w-6 h-6" /></button>
        <button onClick={onPlayPause} className="bg-teal-500 hover:bg-teal-600 text-white rounded-full w-16 h-16 flex items-center justify-center transition shadow-lg">
          {isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8 pl-1" />}
        </button>
        <button onClick={() => onSeek(Math.min(song.duration, currentTime + 10))} className="text-gray-400 hover:text-white transition"><FastForwardIcon className="w-6 h-6" /></button>
        <div className="relative" ref={downloadMenuRef}>
          <button onClick={() => setDownloadMenuOpen(!isDownloadMenuOpen)} className="p-2 rounded-full transition text-gray-400 hover:text-white" aria-label="Download stems">
            <DownloadIcon className="w-6 h-6" />
          </button>
          {isDownloadMenuOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-700 rounded-lg shadow-xl py-2 z-50">
              <button onClick={() => handleDownload('guitar')} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Guitar</button>
              <button onClick={() => handleDownload('backingTrack')} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Backing Track</button>
              <button 
                onClick={handleDownloadBoth} 
                className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-wait"
                disabled={isZipping}
              >
                {isZipping ? 'Zipping...' : 'Both Files (.zip)'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center pt-4">
        <div className="w-full sm:w-auto flex flex-col items-center space-y-2">
            <span className="text-sm font-medium text-gray-300">Playback Speed</span>
            <div className="flex items-center space-x-3">
                <button
                    onClick={() => onSpeedChange(Math.max(0.5, Number((playbackSpeed - 0.1).toFixed(2))))}
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-full w-10 h-10 flex items-center justify-center transition text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Decrease playback speed"
                    disabled={playbackSpeed <= 0.5}
                >
                    -
                </button>
                <span className="text-lg font-mono w-24 text-center text-white tabular-nums">{playbackSpeed.toFixed(2)}x</span>
                <button
                    onClick={() => onSpeedChange(Math.min(2.0, Number((playbackSpeed + 0.1).toFixed(2))))}
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-full w-10 h-10 flex items-center justify-center transition text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Increase playback speed"
                    disabled={playbackSpeed >= 2.0}
                >
                    +
                </button>
            </div>
        </div>
      </div>
      
      <button onClick={onAddBookmark} className="w-full mt-4 bg-teal-500/20 text-teal-300 hover:bg-teal-500/40 font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition">
        <BookmarkIcon className="w-5 h-5" />
        Add Bookmark at {formatTime(currentTime)}
      </button>
    </div>
  );
};

export default memo(Player);
