
import React, { useState, useEffect, useCallback } from 'react';
import { Song, Bookmark, Stem, ALL_STEMS, ActiveView, StemIsolation } from './types';
import FileUpload from './components/FileUpload';
import Player from './components/Player';
import StemMixer from './components/StemMixer';
import AIAssistant from './components/AIAssistant';
import TabGenerator from './components/TabGenerator';
import BookmarkList from './components/BookmarkList';
import { BotIcon, FileTextIcon, BookmarkIcon } from './components/Icons';

const App: React.FC = () => {
  const [song, setSong] = useState<Song | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [pitchShift, setPitchShift] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [stemVolumes, setStemVolumes] = useState<Record<Stem, number>>(
    ALL_STEMS.reduce((acc, stem) => ({ ...acc, [stem]: 100 }), {} as Record<Stem, number>)
  );
  const [activeView, setActiveView] = useState<ActiveView>('assistant');
  const [activeIsolation, setActiveIsolation] = useState<StemIsolation>('full');

  useEffect(() => {
    let timer: number;
    if (isPlaying && song) {
      timer = window.setInterval(() => {
        setCurrentTime(prevTime => {
          const newTime = prevTime + 1;
          if (newTime >= song.duration) {
            setIsPlaying(false);
            return 0;
          }
          return newTime;
        });
      }, 1000 / playbackSpeed);
    }
    return () => {
      window.clearInterval(timer);
    };
  }, [isPlaying, song, playbackSpeed]);

  const handleFileSelect = (file: File) => {
    setIsLoading(true);
    // Simulate file processing and metadata reading
    setTimeout(() => {
      const audio = new Audio(URL.createObjectURL(file));
      audio.addEventListener('loadedmetadata', () => {
        setSong({ name: file.name.replace('.mp3', ''), artist: '', duration: audio.duration });
        setIsLoading(false);
        setIsPlaying(false);
        setCurrentTime(0);
        setBookmarks([]);
        setActiveView('assistant');
        URL.revokeObjectURL(audio.src);
      });
    }, 1500);
  };

  const handlePlayPause = useCallback(() => {
    if(song) setIsPlaying(prev => !prev);
  }, [song]);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSongNameChange = useCallback((name: string) => {
    setSong(prev => (prev ? { ...prev, name } : null));
  }, []);

  const handleArtistNameChange = useCallback((artist: string) => {
    setSong(prev => (prev ? { ...prev, artist } : null));
  }, []);

  const handleAddBookmark = useCallback(() => {
    setBookmarks(prev => [
      ...prev,
      { id: Date.now(), time: currentTime, label: `Bookmark ${prev.length + 1}` }
    ]);
  }, [currentTime]);

  const handleDeleteBookmark = useCallback((id: number) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);

  const handleUpdateBookmarkLabel = useCallback((id: number, label: string) => {
    setBookmarks(prev => prev.map(b => (b.id === id ? { ...b, label } : b)));
  }, []);

  const handleVolumeChange = useCallback((stem: Stem, volume: number) => {
    setStemVolumes(prev => ({ ...prev, [stem]: volume }));
    setActiveIsolation('full'); // custom mix
  }, []);
  
  const handleIsolationChange = useCallback((isolation: StemIsolation) => {
    setActiveIsolation(isolation);
    if(isolation === 'full') {
        setStemVolumes({ guitar: 100, backingTrack: 100 });
    } else if (isolation === 'guitar_only') {
        setStemVolumes({ guitar: 100, backingTrack: 0 });
    } else if (isolation === 'no_guitar') {
        setStemVolumes({ guitar: 0, backingTrack: 100 });
    }
  }, []);

  const renderActiveView = () => {
    switch (activeView) {
      case 'assistant':
        return <AIAssistant song={song} />;
      case 'tabs':
        return <TabGenerator song={song} />;
      case 'bookmarks':
        return <BookmarkList bookmarks={bookmarks} onDeleteBookmark={handleDeleteBookmark} onUpdateBookmarkLabel={handleUpdateBookmarkLabel} onGoToBookmark={handleSeek}/>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 lg:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-white">SongAssist</h1>
      </header>

      <main className="max-w-7xl mx-auto">
        {!song ? (
          <div className="max-w-2xl mx-auto">
             {isLoading ? (
                 <div className="text-center p-10">
                    <div className="w-16 h-16 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-300 text-lg">Analyzing your song...</p>
                 </div>
             ) : (
                <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />
             )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3 space-y-8">
              <Player 
                song={song} 
                isPlaying={isPlaying} 
                currentTime={currentTime}
                playbackSpeed={playbackSpeed}
                pitchShift={pitchShift}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
                onSpeedChange={setPlaybackSpeed}
                onPitchChange={setPitchShift}
                onAddBookmark={handleAddBookmark}
                onSongNameChange={handleSongNameChange}
                onArtistNameChange={handleArtistNameChange}
              />
              <StemMixer 
                stemVolumes={stemVolumes} 
                onVolumeChange={handleVolumeChange}
                activeIsolation={activeIsolation}
                onIsolationChange={handleIsolationChange}
              />
            </div>
            <div className="lg:col-span-2 bg-gray-800 p-6 rounded-xl shadow-lg flex flex-col min-h-[500px]">
                <div className="flex-shrink-0 mb-4 border-b border-gray-700">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        <button onClick={() => setActiveView('assistant')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${activeView === 'assistant' ? 'border-teal-400 text-teal-300' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}>
                            <BotIcon className="w-5 h-5"/> AI Assistant
                        </button>
                        <button onClick={() => setActiveView('tabs')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${activeView === 'tabs' ? 'border-teal-400 text-teal-300' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}>
                            <FileTextIcon className="w-5 h-5"/> Tablature
                        </button>
                        <button onClick={() => setActiveView('bookmarks')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${activeView === 'bookmarks' ? 'border-teal-400 text-teal-300' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}>
                           <BookmarkIcon className="w-5 h-5"/> Bookmarks
                        </button>
                    </nav>
                </div>
                <div className="flex-grow overflow-hidden">
                    {renderActiveView()}
                </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
