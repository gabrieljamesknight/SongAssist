
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Song, Bookmark, Stem, ALL_STEMS, ActiveView, StemIsolation, ChatMessage } from './types';
import FileUpload from './components/FileUpload';
import Player from './components/Player';
import StemMixer from './components/StemMixer';
import {AIAssistant} from './components/AIAssistant';
import TabGenerator from './components/TabGenerator';
import BookmarkList from './components/BookmarkList';
import { BotIcon, FileTextIcon, BookmarkIcon } from './components/Icons';
import { getInitialSongAnalysis, getPlayingAdvice } from './services/geminiService';


function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

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

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<number | null>(null);

  // Web Audio API References
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  
  // Playback State Refs
  const pausedAtRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);

  // The context is only created on a direct user gesture.
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = context;
        const gain = context.createGain();
        gain.connect(context.destination);
        gainNodeRef.current = gain;
        // Set initial volume
        gain.gain.value = stemVolumes.backingTrack / 100;
      } catch (e) {
        console.error("Web Audio API is not supported in this browser", e);
        // Here you could show an error to the user
      }
    }
    return audioContextRef.current;
  }, [stemVolumes.backingTrack]);

  // This effect ensures that if an AudioContext was created, it gets closed on unmount.
  useEffect(() => {
    return () => {
      audioContextRef.current?.close().catch(console.error);
    };
  }, []);

  // Update Gain Node when volume changes
  useEffect(() => {
    if (gainNodeRef.current) {
      // Use "backingTrack" slider as the master volume control.
      gainNodeRef.current.gain.value = stemVolumes.backingTrack / 100;
    }
  }, [stemVolumes]);
  
  // Smoothly update currentTime with requestAnimationFrame
  useEffect(() => {
    let animationFrameId: number;
    const update = () => {
      if (isPlaying && audioContextRef.current && song) {
        const elapsed = audioContextRef.current.currentTime - startedAtRef.current;
        const newTime = pausedAtRef.current + elapsed * playbackSpeed;
        if (newTime < song.duration) {
          setCurrentTime(newTime);
        } else {
          setCurrentTime(song.duration);
          // onended callback will handle reset
        }
      }
      animationFrameId = requestAnimationFrame(update);
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(update);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, song, playbackSpeed]);

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null; // Prevent onended from firing on manual stop
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Ignore errors from stopping already stopped sources
      }
      sourceNodeRef.current = null;
    }
  };

  const startPlayback = useCallback((offset: number) => {
    const context = getAudioContext();
    if (!context || !audioBufferRef.current || !gainNodeRef.current) return;
    
    stopPlayback();

    const source = context.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = playbackSpeed;
    source.connect(gainNodeRef.current);
    
    source.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      pausedAtRef.current = 0;
    };

    const validatedOffset = Math.max(0, offset);
    source.start(0, validatedOffset);
    sourceNodeRef.current = source;
    pausedAtRef.current = validatedOffset;
    startedAtRef.current = context.currentTime;
  }, [playbackSpeed, getAudioContext]);

  const handlePlayPause = useCallback(async () => {
    const context = getAudioContext();
    if (!audioBufferRef.current || !context) return;

    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch(e) {
        console.error("Error resuming AudioContext:", e);
        return;
      }
    }

    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    if (newIsPlaying) {
      startPlayback(pausedAtRef.current);
    } else {
      const elapsed = (context.currentTime - startedAtRef.current);
      pausedAtRef.current = pausedAtRef.current + elapsed * playbackSpeed;
      stopPlayback();
    }
  }, [isPlaying, playbackSpeed, startPlayback, getAudioContext]);

  const prevPlaybackSpeed = usePrevious(playbackSpeed);
  useEffect(() => {
    const context = audioContextRef.current;
    if (prevPlaybackSpeed !== undefined && prevPlaybackSpeed !== playbackSpeed && isPlaying && context) {
      const elapsed = (context.currentTime - startedAtRef.current);
      const newPausedTime = pausedAtRef.current + elapsed * prevPlaybackSpeed;
      pausedAtRef.current = newPausedTime;
      setCurrentTime(newPausedTime);
      startPlayback(newPausedTime);
    }
  }, [playbackSpeed, prevPlaybackSpeed, isPlaying, startPlayback]);

  const handleFileSelect = (file: File) => {
    setIsLoading(true);
    const context = getAudioContext();

    if (!context) {
        console.error("AudioContext could not be created.");
        setIsLoading(false);
        return;
    }

    if (context.state === 'suspended') {
      context.resume().catch(e => console.error("Could not resume context on file select:", e));
    }

    if (isPlaying) {
      handlePlayPause();
    }
    
    stopPlayback();
    setSong(null);
    audioBufferRef.current = null;
    setCurrentTime(0);
    pausedAtRef.current = 0;
    setIsPlaying(false);
    setBookmarks([]);
    setChatMessages([]);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const decodedBuffer = await context.decodeAudioData(arrayBuffer);
            audioBufferRef.current = decodedBuffer;
            setSong({
                name: file.name.replace(/\.[^/.]+$/, ''),
                duration: decodedBuffer.duration,
                artist: ''
            });
            setActiveView('assistant');
        } catch (err) {
            console.error("Error decoding audio data:", err);
        } finally {
            setIsLoading(false);
        }
    };
    reader.readAsArrayBuffer(file);
  };
  
  useEffect(() => {
    if (!song?.name) {
        setChatMessages([]);
        return;
    }

    const fetchInitialAnalysis = async (songName: string, artist: string | undefined) => {
        setChatMessages([]);
        setIsAssistantLoading(true);
        const analysis = await getInitialSongAnalysis(songName, artist);
        
        let initialMessageContent: string;
        if (analysis && analysis.trim() !== 'UNKNOWN_SONG') {
            initialMessageContent = analysis;
        } else {
            initialMessageContent = `I'm ready to help you practice "${songName}". Ask me for advice on chords, techniques, or anything else!`;
        }
        setChatMessages([{ role: 'model', content: initialMessageContent }]);
        setIsAssistantLoading(false);
    };

    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    const timer = window.setTimeout(() => {
        if (song.name) fetchInitialAnalysis(song.name, song.artist);
    }, 800);
    setDebounceTimer(timer);

    return () => clearTimeout(timer);
  }, [song?.name, song?.artist]);


  const handleSeek = useCallback((time: number) => {
    if (!song) return;
    const newTime = Math.max(0, Math.min(time, song.duration));
    setCurrentTime(newTime);
    pausedAtRef.current = newTime;
    if (isPlaying) {
      startPlayback(newTime);
    }
  }, [isPlaying, song, startPlayback]);

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
    setActiveIsolation('full'); 
  }, []);
  
  const handleIsolationChange = useCallback((isolation: StemIsolation) => {
    setActiveIsolation(isolation);
    if (isolation === 'no_guitar') {
        setStemVolumes({ guitar: 0, backingTrack: 0 });
    } else {
        setStemVolumes({ guitar: 100, backingTrack: 100 });
    }
  }, []);

  const handleSendMessage = useCallback(async (query: string) => {
    if (!query.trim() || isAssistantLoading || !song) return;
    const userMessage: ChatMessage = { role: 'user', content: query };
    setChatMessages(prev => [...prev, userMessage]);
    setIsAssistantLoading(true);
    const advice = await getPlayingAdvice(song.name, song.artist, query);
    const modelMessage: ChatMessage = { role: 'model', content: advice };
    setChatMessages(prev => [...prev, modelMessage]);
    setIsAssistantLoading(false);
  }, [song, isAssistantLoading]);

  const renderActiveView = () => {
    switch (activeView) {
      case 'assistant':
        return <AIAssistant 
                  song={song} 
                  messages={chatMessages} 
                  isLoading={isAssistantLoading} 
                  onSendMessage={handleSendMessage} 
                />;
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
