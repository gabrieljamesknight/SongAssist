import { useState, useEffect, useCallback, FC } from 'react';
import { Song, Bookmark, ActiveView, ChatMessage, Stem, StemIsolation } from './types';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { FileUpload } from './components/FileUpload';
import Player from './components/Player';
import StemMixer from './components/StemMixer';
import { AIAssistant } from './components/AIAssistant';
import TabGenerator from './components/TabGenerator';
import BookmarkList from './components/BookmarkList';
import { BotIcon, FileTextIcon, BookmarkIcon } from './components/Icons';
import { getInitialSongAnalysis, getPlayingAdvice, generateTabs, identifySongFromFileName, SongIdentification } from './services/geminiService';

const App: FC = () => {
    const player = useAudioPlayer();
    const [isSeparating, setIsSeparating] = useState(false);
    const [appError, setAppError] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<ActiveView>('assistant');
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isAssistantLoading, setIsAssistantLoading] = useState(false);
    const [tabs, setTabs] = useState<string | null>(null);
    const [isTabGeneratorLoading, setIsTabGeneratorLoading] = useState(false);
    const [tabGeneratorError, setTabGeneratorError] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [originalFileName, setOriginalFileName] = useState<string>('');
    const [activeIsolation, setActiveIsolation] = useState<StemIsolation>('full');


    useEffect(() => {
        if (!taskId) return;
        const separationTimeout = setTimeout(() => {
            clearInterval(poll);
            setIsSeparating(false);
            setAppError("Processing timed out. The server might be busy or the file is unsupported.");
        }, 3000000);

        const poll = setInterval(async () => {
            try {
        const bucketName = "songassist-stems-gabriel-2025";
        const awsRegion = "eu-west-2";

        const response = await fetch(`https://${bucketName}.s3.${awsRegion}.amazonaws.com/stems/${taskId}/manifest.json`);
                if (response.ok) {
                    clearInterval(poll);
                    clearTimeout(separationTimeout);
                    const data = await response.json();
                    setIsSeparating(false);
                    const songName = originalFileName.replace(/\.[^/.]+$/, '');
                    
                    // Load the song with a temporary "Identifying..." message
                    await player.load(data.stems, { name: songName, artist: 'Identifying...' });
                    
                    const identification = await identifySongFromFileName(originalFileName);
                    
                    // Use the title from Gemini
                    const identifiedTitle = identification?.songTitle || songName;
                    // Use the artist from Gemini
                    const identifiedArtist = identification?.artist || 'Unknown Artist';
                    
                    // Update the song state
                    player.setSong(currentSong => {
                        if (!currentSong) return null;
                        return {
                            ...currentSong,
                            name: identifiedTitle,
                            artist: identifiedArtist,
                        };
                    });
                }
            } catch (error) { 
                console.log("Polling for manifest...");
            }
        }, 3000);

        return () => {
            clearInterval(poll);
            clearTimeout(separationTimeout);
        };
    }, [taskId, originalFileName, player.load]);

    useEffect(() => {
        const fetchInitialAnalysis = async () => {
            if (player.song && player.song.name && player.song.artist !== 'Identifying...') {
                setIsAssistantLoading(true);
                const loadingMessage: ChatMessage = { role: 'model', content: `Analyzing ${player.song.name}...` };
                setChatMessages([loadingMessage]);
                const analysis = await getInitialSongAnalysis(player.song.name, player.song.artist);
                if (analysis && analysis !== "UNKNOWN_SONG") {
                    const analysisMessage: ChatMessage = { role: 'model', content: analysis };
                    setChatMessages([analysisMessage]);
                } else {
                    const welcomeMessage: ChatMessage = { role: 'model', content: "Welcome! I couldn't find specific info for this song, but feel free to ask me any general questions about playing guitar." };
                    setChatMessages([welcomeMessage]);
                }
                setIsAssistantLoading(false);
            }
        };
        fetchInitialAnalysis();
    }, [player.song?.name, player.song?.artist]);

    const handleUploadSubmit = (originalFile: File, newTaskId: string) => {
        setAppError(null);
        player.setSong(null);
        setIsSeparating(true);
        setOriginalFileName(originalFile.name);
        setTaskId(newTaskId);
        setChatMessages([]);
        setTabs(null);
    };

    const handlePlayPause = () => {
        if (player.isPlaying) player.pause();
        else player.play();
    };
    
    const handleAddBookmark = useCallback(() => setBookmarks(prev => [...prev, { id: Date.now(), time: player.currentTime, label: `Bookmark ${prev.length + 1}` }]), [player.currentTime]);
    const handleDeleteBookmark = useCallback((id: number) => setBookmarks(prev => prev.filter(b => b.id !== id)), []);
    const handleUpdateBookmarkLabel = useCallback((id: number, label: string) => setBookmarks(prev => prev.map(b => (b.id === id ? { ...b, label } : b))), []);
    
    const handleSendMessage = useCallback(async (query: string) => { 
        if (!player.song) return;
        const userMessage: ChatMessage = { role: 'user', content: query };
        setChatMessages(prev => [...prev, userMessage]);
        setIsAssistantLoading(true);
        try {
            const responseText = await getPlayingAdvice(player.song.name, player.song.artist, query);
            const modelMessage: ChatMessage = { role: 'model', content: responseText };
            setChatMessages(prev => [...prev, modelMessage]);
        } catch (error) {
            const errorMessage: ChatMessage = { role: 'model', content: "Sorry, I couldn't connect to the AI assistant right now." };
            setChatMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsAssistantLoading(false);
        }
    }, [player.song]);

    const handleGenerateTabs = useCallback(async () => { 
        if (!player.song) return;
        setIsTabGeneratorLoading(true);
        setTabGeneratorError(null);
        setTabs(null);
        try {
            const responseText = await generateTabs(player.song.name, player.song.artist);
            setTabs(responseText);
        } catch (error) {
            setTabGeneratorError("An error occurred while generating tabs. Please try again.");
        } finally {
            setIsTabGeneratorLoading(false);
        }
    }, [player.song]);

    const handleIsolationChange = (isolation: StemIsolation) => {
        setActiveIsolation(isolation);
        switch (isolation) {
            case 'guitar':
                player.setStemVolumes({ guitar: 100, backingTrack: 0 });
                break;
            case 'backingTrack':
                player.setStemVolumes({ guitar: 0, backingTrack: 100 });
                break;
            case 'full':
            default:
                player.setStemVolumes({ guitar: 100, backingTrack: 100 });
                break;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 lg:p-8 font-sans">
            <header className="mb-8 text-center">
                <h1 className="text-4xl font-bold text-white tracking-tight">SongAssist</h1>
                <p className="text-gray-400 mt-1">Your AI-Powered Practice Partner</p>
            </header>

            <main className="max-w-7xl mx-auto">
                {appError && <div className="bg-red-900/50 text-red-200 p-3 rounded-lg text-center mb-4">{appError}</div>}
                {player.error && <div className="bg-red-900/50 text-red-200 p-3 rounded-lg text-center mb-4">{player.error}</div>}
                {isSeparating || player.isLoading ? (
                    <div className="max-w-2xl mx-auto mt-4">
                        <div className="text-center p-10">
                            <div className="w-16 h-16 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="mt-4 text-gray-300 text-lg">
                                {isSeparating ? "Separating audio stems..." : "Loading audio..."}
                            </p>
                            {isSeparating && <p className="text-sm text-gray-500">(This can take a minute or two)</p>}
                        </div>
                    </div>
                ) : !player.song ? (
                    <div className="max-w-2xl mx-auto mt-4">
                        <FileUpload onUploadSubmit={handleUploadSubmit} />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                        <div className="lg:col-span-3 space-y-8">
                            <Player 
                                song={player.song}
                                isPlaying={player.isPlaying}
                                currentTime={player.currentTime}
                                playbackSpeed={player.playbackSpeed}
                                onPlayPause={handlePlayPause}
                                onSeek={player.seek}
                                onSpeedChange={player.setPlaybackSpeed}
                                onAddBookmark={handleAddBookmark}
                                onSongNameChange={(name) => player.setSong((s: Song | null) => s ? { ...s, name } : null)}
                                onArtistNameChange={(artist) => player.setSong((s: Song | null) => s ? { ...s, artist } : null)}
                            />
                            <StemMixer 
                                stemVolumes={player.stemVolumes} 
                                onVolumeChange={(stem: Stem, vol: number) => {
                                    player.setStemVolumes((v: Record<Stem, number>) => ({...v, [stem]: vol}));
                                    setActiveIsolation('custom');
                                }}
                                activeIsolation={activeIsolation}
                                onIsolationChange={handleIsolationChange}
                                isSeparating={isSeparating}
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
                            <div className="flex-grow overflow-hidden relative">
                                <div className={`h-full w-full absolute top-0 left-0 transition-opacity duration-200 ${activeView === 'assistant' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                    <AIAssistant 
                                        song={player.song} 
                                        messages={chatMessages} 
                                        isLoading={isAssistantLoading} 
                                        onSendMessage={handleSendMessage} 
                                    />
                                </div>
                                <div className={`h-full w-full absolute top-0 left-0 transition-opacity duration-200 ${activeView === 'tabs' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                    <TabGenerator
                                        song={player.song}
                                        tabs={tabs}
                                        isLoading={isTabGeneratorLoading}
                                        error={tabGeneratorError}
                                        onGenerateTabs={handleGenerateTabs}
                                    />
                                </div>
                                 <div className={`h-full w-full absolute top-0 left-0 transition-opacity duration-200 ${activeView === 'bookmarks' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                    <BookmarkList 
                                        bookmarks={bookmarks} 
                                        onDeleteBookmark={handleDeleteBookmark} 
                                        onUpdateBookmarkLabel={handleUpdateBookmarkLabel} 
                                        onGoToBookmark={player.seek}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;
