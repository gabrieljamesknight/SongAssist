import { useState, useEffect, useCallback, FC } from 'react';
import { Song, Bookmark, ActiveView, ChatMessage, Stem, StemIsolation, Project } from './types';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { FileUpload } from './components/FileUpload';
import Player from './components/Player';
import StemMixer from './components/StemMixer';
import { AIAssistant } from './components/AIAssistant';
import TabGenerator from './components/TabGenerator';
import BookmarkList from './components/BookmarkList';
import { LoginScreen } from './components/LoginScreen';
import { ProjectList } from './components/ProjectList';
import { BotIcon, FileTextIcon, BookmarkIcon, LogOutIcon } from './components/Icons';
import { getInitialSongAnalysis, getPlayingAdvice, generateTabs, identifySongFromFileName } from './services/geminiService';

const App: FC = () => {
    const player = useAudioPlayer();
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [userProjects, setUserProjects] = useState<Project[]>([]);
    const [isUserLoading, setIsUserLoading] = useState<boolean>(false);
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
    const [activeIsolation, setActiveIsolation] = useState<StemIsolation>('full');


    useEffect(() => {
        if (!taskId || !currentUser) return;

        const separationTimeout = setTimeout(() => {
            clearInterval(poll);
            setIsSeparating(false);
            setAppError("Processing timed out. The server might be busy or the file is unsupported.");
        }, 3000000);

        const poll = setInterval(async () => {
            try {
                const manifestUrl = `https://${process.env.REACT_APP_S3_BUCKET_NAME}.s3.${process.env.REACT_APP_AWS_REGION}.amazonaws.com/stems/${currentUser}/${taskId}/manifest.json`;
                const response = await fetch(manifestUrl);
                if (response.ok) {
                    clearInterval(poll);
                    clearTimeout(separationTimeout);
                    const data = await response.json();
                    await handleLoadProject(manifestUrl, data.originalFileName);
                }
            } catch (error) {
                console.log("Polling for manifest...");
            }
        }, 3000);

        return () => {
            clearInterval(poll);
            clearTimeout(separationTimeout);
        };
    }, [taskId, currentUser]);

    // Gemini
    useEffect(() => {
        const fetchInitialAnalysis = async () => {
            if (player.song && player.song.name && player.song.artist && player.song.artist !== 'Identifying...') {
                setIsAssistantLoading(true);
                setChatMessages([]);
                const analysis = await getInitialSongAnalysis(player.song.name, player.song.artist);
                if (analysis && analysis !== "UNKNOWN_SONG") {
                    setChatMessages([{ role: 'model', content: analysis }]);
                } else {
                    setChatMessages([{ role: 'model', content: "Welcome! I couldn't find specific info for this song, but feel free to ask me any general questions about playing guitar." }]);
                }
                setIsAssistantLoading(false);
            }
        };
        fetchInitialAnalysis();
    }, [player.song?.name, player.song?.artist]);


    const handleLogin = async (username: string) => {
        setIsUserLoading(true);
        setAppError(null);
        try {
            const response = await fetch(`http://127.0.0.1:8000/user/${username}/projects`);
            if (!response.ok) throw new Error("Could not connect to the server.");
            const data = await response.json();
            setUserProjects(data.projects);
            setCurrentUser(username);
        } catch (error) {
            setAppError("Login failed. Please check your connection and try again.");
        } finally {
            setIsUserLoading(false);
        }
    };

    const handleLogout = () => {
        player.pause();
        setCurrentUser(null);
        setUserProjects([]);
        player.setSong(null);
        setBookmarks([]);
        setChatMessages([]);
        setTabs(null);
        setAppError(null);
    };

    const handleUploadSubmit = (originalFile: File, newTaskId: string) => {
        setAppError(null);
        player.setSong(null);
        setIsSeparating(true);
        setTaskId(newTaskId);
        setChatMessages([]);
        setBookmarks([]);
        setTabs(null);
    };

    const handleLoadProject = async (manifestUrl: string, originalFileName: string) => {
        setIsSeparating(false);
        player.setSong(null);
        setAppError(null);
        setBookmarks([]);
        setChatMessages([]);
        setTabs(null);

        try {
            const response = await fetch(manifestUrl);
            const data = await response.json();
            
            await player.load(data.stems, { name: originalFileName.replace(/\.[^/.]+$/, ''), artist: 'Identifying...' });
            
            const identification = await identifySongFromFileName(originalFileName);
            const identifiedTitle = identification?.songTitle || originalFileName.replace(/\.[^/.]+$/, '');
            const identifiedArtist = identification?.artist || 'Unknown Artist';
            
            player.setSong(currentSong => currentSong ? { ...currentSong, name: identifiedTitle, artist: identifiedArtist } : null);
        } catch (error) {
            setAppError("Failed to load the selected project.");
        }
    };

    const handlePlayPause = () => player.isPlaying ? player.pause() : player.play();
    
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
            case 'guitar': player.setStemVolumes({ guitar: 100, backingTrack: 0 }); break;
            case 'backingTrack': player.setStemVolumes({ guitar: 0, backingTrack: 100 }); break;
            case 'full': default: player.setStemVolumes({ guitar: 100, backingTrack: 100 }); break;
        }
    };


    const renderContent = () => {
        // Loading
        if (isUserLoading || isSeparating || player.isLoading) {
            return (
                <div className="max-w-2xl mx-auto mt-4">
                    <div className="text-center p-10">
                        <div className="w-16 h-16 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="mt-4 text-gray-300 text-lg">
                            {isUserLoading ? "Loading projects..." : isSeparating ? "Separating audio stems..." : "Loading audio..."}
                        </p>
                        {isSeparating && <p className="text-sm text-gray-500">(This can take a minute or two)</p>}
                    </div>
                </div>
            );
        }

        // Logged In, no song 
        if (currentUser && !player.song) {
            return (
                <div className="max-w-2xl mx-auto mt-4 space-y-8">
                    <FileUpload onUploadSubmit={handleUploadSubmit} currentUser={currentUser} />
                    <ProjectList projects={userProjects} onLoadProject={(url) => handleLoadProject(url, userProjects.find(p => p.manifestUrl === url)?.originalFileName || '')} />
                </div>
            );
        }

        // Song is loaded
        if (currentUser && player.song) {
            return (
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
                            onSongNameChange={(name) => player.setSong((s) => s ? { ...s, name } : null)}
                            onArtistNameChange={(artist) => player.setSong((s) => s ? { ...s, artist } : null)}
                        />
                        <StemMixer 
                            stemVolumes={player.stemVolumes} 
                            onVolumeChange={(stem, vol) => {
                                player.setStemVolumes(v => ({...v, [stem]: vol}));
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
                                <AIAssistant song={player.song} messages={chatMessages} isLoading={isAssistantLoading} onSendMessage={handleSendMessage} />
                            </div>
                            <div className={`h-full w-full absolute top-0 left-0 transition-opacity duration-200 ${activeView === 'tabs' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                <TabGenerator song={player.song} tabs={tabs} isLoading={isTabGeneratorLoading} error={tabGeneratorError} onGenerateTabs={handleGenerateTabs} />
                            </div>
                             <div className={`h-full w-full absolute top-0 left-0 transition-opacity duration-200 ${activeView === 'bookmarks' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                <BookmarkList bookmarks={bookmarks} onDeleteBookmark={handleDeleteBookmark} onUpdateBookmarkLabel={handleUpdateBookmarkLabel} onGoToBookmark={player.seek} />
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Not logged in
        return <LoginScreen onLogin={handleLogin} isLoading={isUserLoading} />;
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 lg:p-8 font-sans">
            <header className="mb-8 text-center relative">
                <h1 className="text-4xl font-bold text-white tracking-tight">SongAssist</h1>
                <p className="text-gray-400 mt-1">Your AI-Powered Practice Partner</p>
                {currentUser && (
                    <div className="absolute top-0 right-0 flex items-center gap-4">
                        <span className="text-gray-300">Welcome, <strong className="font-semibold text-white">{currentUser}</strong></span>
                        <button onClick={handleLogout} className="flex items-center gap-2 bg-gray-700 hover:bg-red-800/50 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                           <LogOutIcon className="w-5 h-5" /> Logout
                        </button>
                    </div>
                )}
            </header>

            <main className="max-w-7xl mx-auto">
                {appError && <div className="bg-red-900/50 text-red-200 p-3 rounded-lg text-center mb-4">{appError}</div>}
                {player.error && <div className="bg-red-900/50 text-red-200 p-3 rounded-lg text-center mb-4">{player.error}</div>}
                
                {renderContent()}
            </main>
        </div>
    );
};

export default App;