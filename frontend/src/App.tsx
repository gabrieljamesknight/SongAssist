import { useState, useEffect, useCallback, FC, useRef } from 'react';
import { Song, Bookmark, ActiveView, ChatMessage, StemIsolation, Project } from './types';
import { useAudioPlayerContext } from './contexts/AudioPlayerContext';
import { FileUpload } from './components/FileUpload';
import Player from './components/Player';
import StemMixer from './components/StemMixer';
import { AIAssistant } from './components/AIAssistant';
import ChordAnalysis from './components/ChordAnalysis';
import BookmarkList from './components/BookmarkList';
import { LoginScreen } from './components/LoginScreen';
import { ProjectList } from './components/ProjectList';
import ConfirmationModal from './components/ConfirmationModal';
import { BotIcon, FileTextIcon, BookmarkIcon, LogOutIcon } from './components/Icons';
import { getInitialSongAnalysis, getPlayingAdvice, analyzeChordsFromStem, identifySongFromFileName, formatChordAnalysis } from './services/geminiService';


const App: FC = () => {

    const player = useAudioPlayerContext();
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [userProjects, setUserProjects] = useState<Project[]>([]);
    const [isUserLoading, setIsUserLoading] = useState<boolean>(false);
    const [isSeparating, setIsSeparating] = useState(false);
    const [isProjectLoading, setIsProjectLoading] = useState<boolean>(false);
    const [appError, setAppError] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<ActiveView>('assistant');
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isAssistantLoading, setIsAssistantLoading] = useState(false);
    const [chordAnalysis, setChordAnalysis] = useState<string | null>(null);
    const [isChordAnalysisLoading, setIsChordAnalysisLoading] = useState(false);
    const [chordAnalysisError, setChordAnalysisError] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [activeIsolation, setActiveIsolation] = useState<StemIsolation>('full');
    const [confirmModalState, setConfirmModalState] = useState({ isOpen: false, taskIdToDelete: null as string | null });
    const isInitialMount = useRef(true);
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [debouncedSongForAnalysis, setDebouncedSongForAnalysis] = useState<Song | null>(null);
    const analysisDebounceRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!taskId || !currentUser || !isSeparating) return;

        const separationTimeout = setTimeout(() => {
            clearInterval(poll);
            setIsSeparating(false);
            setAppError("Processing timed out. The server might be busy or the file is unsupported.");
        }, 3000000);

        const poll = setInterval(async () => {
            try {
                const manifestUrl = `${import.meta.env.VITE_API_BASE}/project/${currentUser}/${taskId}/manifest`;
                const response = await fetch(manifestUrl);
                if (response.ok) {
                    clearInterval(poll);
                    clearTimeout(separationTimeout);

                    await fetchProjects(currentUser);

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
    }, [taskId, currentUser, isSeparating]);

    useEffect(() => {
        if (analysisDebounceRef.current) {
            clearTimeout(analysisDebounceRef.current);
        }

        if (player.song && player.song.name && player.song.artist && player.song.artist !== 'Identifying...' && player.song.artist !== '...') {
            analysisDebounceRef.current = setTimeout(() => {
                setDebouncedSongForAnalysis(player.song);
            }, 1500);
        }

        return () => {
            if (analysisDebounceRef.current) {
                clearTimeout(analysisDebounceRef.current);
            }
        };
    }, [player.song]);

    useEffect(() => {
        const fetchInitialAnalysis = async () => {
            if (debouncedSongForAnalysis && debouncedSongForAnalysis.name && debouncedSongForAnalysis.artist) {
                setIsAssistantLoading(true);
                setChatMessages([]);
                const analysis = await getInitialSongAnalysis(debouncedSongForAnalysis.name, debouncedSongForAnalysis.artist);
                if (analysis && analysis !== "UNKNOWN_SONG") {
                    setChatMessages([{ role: 'model', content: analysis }]);
                } else {
                    setChatMessages([{ role: 'model', content: "Welcome! I couldn't find specific info for this song, but feel free to ask me any general questions about playing guitar." }]);
                }
                setIsAssistantLoading(false);
            }
        };
        fetchInitialAnalysis();
    }, [debouncedSongForAnalysis]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        if (!currentUser || !taskId) {
            return;
        }

        const saveBookmarks = async () => {
            try {
                await fetch(`http://127.0.0.1:8000/${currentUser}/${taskId}/bookmarks`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bookmarks),
                });
            } catch (error) {
                console.error("Failed to save bookmarks:", error);
            }
        };
        saveBookmarks();

    }, [bookmarks, currentUser, taskId]);

    const fetchProjects = async (username: string) => {
        const response = await fetch(`http://127.0.0.1:8000/user/${username}/projects`);
        if (!response.ok) throw new Error("Could not fetch projects.");
        const data = await response.json();
        setUserProjects(data.projects);
        setCurrentUser(username);
    };

    const handleLogin = async (username: string, password: string) => {
        setIsUserLoading(true);
        setAppError(null);
        try {
            const response = await fetch(`http://127.0.0.1:8000/login/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Login failed.");
            }

            // If login is successful, now fetch the projects
            await fetchProjects(username);

        } catch (error: any) {
            setAppError(error.message || "Login failed. Please check your credentials and try again.");
            setCurrentUser(null);
            setUserProjects([]);
        } finally {
            setIsUserLoading(false);
        }
    };

    const handleRegister = async (username: string, password: string) => {
        setIsUserLoading(true);
        setAppError(null);
        try {
            const response = await fetch(`http://127.0.0.1:8000/register/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.detail || "Registration failed.");
            }
            await handleLogin(username, password);

        } catch (error: any) {
            setAppError(error.message || "Registration failed. Please try a different username.");
        } finally {
            setIsUserLoading(false);
        }
    };

    const handleLogout = async () => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        player.pause();
        setCurrentUser(null);
        setUserProjects([]);
        player.setSong(null);
        setBookmarks([]);
        setChatMessages([]);
        setChordAnalysis(null);
        setAppError(null);
        setTaskId(null);
        setActiveView('assistant');
    };

    const handleBackToProjects = () => {
        if (player.isPlaying) {
            player.pause();
        }
        player.setSong(null);
        setBookmarks([]);
        setChatMessages([]);
        setChordAnalysis(null);
        setAppError(null);
        setTaskId(null);
        setActiveView('assistant');
        isInitialMount.current = true;
    };

    const handleUploadSubmit = (originalFile: File, newTaskId: string) => {
        setAppError(null);
        player.setSong(null);
        setIsSeparating(true);
        setTaskId(newTaskId);
        setChatMessages([]);
        setBookmarks([]);
        setChordAnalysis(null);
        setActiveView('assistant');
        isInitialMount.current = true;
    };

    const saveProjectMetadata = async (taskIdToSave: string, metadata: { songTitle: string; artist: string; }) => {
        if (!currentUser) return;
        try {
            await fetch(`http://127.0.0.1:8000/${currentUser}/${taskIdToSave}/metadata`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metadata),
            });
        } catch (error) {
            console.error("Failed to save metadata:", error);
        }
    };

const handleLoadProject = async (manifestUrl: string, originalFileName: string) => {
        setIsProjectLoading(true);
        setAppError(null);
        setBookmarks([]);
        setChatMessages([]);
        setChordAnalysis(null);
        setActiveView('assistant');
        isInitialMount.current = true;

        const urlParts = manifestUrl.split('/');
        const loadedTaskId = urlParts[urlParts.length - 2];
        setTaskId(loadedTaskId);

        try {
            const response = await fetch(manifestUrl);
            if (!response.ok) {
                throw new Error(`Manifest fetch failed with status: ${response.status}`);
            }
            const data = await response.json();

            if (data.analysisUrl) {
                try {
                    const analysisResponse = await fetch(data.analysisUrl);
                    if (analysisResponse.ok) {
                        const analysisJson = await analysisResponse.json();
                        const formattedAnalysis = formatChordAnalysis(analysisJson);
                        setChordAnalysis(formattedAnalysis);
                    }
                } catch (analysisError) {
                    console.error("Failed to load existing chord analysis:", analysisError);
                }
            }

            let bookmarksData: Bookmark[] = [];
            const bookmarksUrl = manifestUrl.replace(/\/manifest\.json$/, '/bookmarks.json');

        try {
            const bookmarksResponse = await fetch(bookmarksUrl);
                if (bookmarksResponse.ok) {
                    const loadedData = await bookmarksResponse.json();
                    if (Array.isArray(loadedData)) {
                        bookmarksData = loadedData;
                    }
                }
            } catch (bookmarkError) {
                console.log("No existing bookmarks found for this project.");
            }


            const nameWithoutExt = originalFileName.replace(/\.[^/.]+$/, '');
            const cleanedName = nameWithoutExt.replace(/^\d+[\s.-]*/, '');

            await player.load(data.stems, { name: cleanedName, artist: '...' });

            let finalTitle = cleanedName;
            let finalArtist = '';

            if ('songTitle' in data && data.songTitle) {
                finalTitle = data.songTitle;
                finalArtist = data.artist || '';
                player.setSong(s => s ? { ...s, name: finalTitle, artist: finalArtist, artistConfirmed: true } : null);
            } else {
                player.setSong(s => s ? { ...s, artist: 'Identifying...', artistConfirmed: false } : null);
                const identification = await identifySongFromFileName(cleanedName);

                const identifiedTitle = identification?.songTitle || cleanedName;
                const aiArtist = identification?.artist;
                const identifiedArtist = (aiArtist && aiArtist.toLowerCase() !== 'unknown artist') ? aiArtist : '';

                finalTitle = identifiedTitle;
                finalArtist = identifiedArtist;

                player.setSong(s => s ? { ...s, name: finalTitle, artist: finalArtist, artistConfirmed: false } : null);

                await saveProjectMetadata(loadedTaskId, { songTitle: finalTitle, artist: finalArtist });
            }

            setBookmarks(bookmarksData);

            setUserProjects(currentProjects =>
                currentProjects.map(p =>
                    p.taskId === loadedTaskId
                        ? { ...p, originalFileName: finalTitle }
                        : p
                )
            );

        } catch (error) {
            console.error("Error in handleLoadProject:", error);
            setAppError("Failed to load the selected project.");
            player.setSong(null);
        } finally {
            setIsProjectLoading(false);
            setIsSeparating(false);
        }
    };

    const handleDeleteProject = (taskIdToDelete: string) => {
        if (!currentUser) {
            setAppError("You must be logged in to delete a project.");
            return;
        }
        setConfirmModalState({ isOpen: true, taskIdToDelete: taskIdToDelete });
    };

    const executeDeleteProject = async () => {
        const { taskIdToDelete } = confirmModalState;
        if (!currentUser || !taskIdToDelete) return;

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE}/project/${currentUser}/${taskIdToDelete}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to delete the project.");
            }

            setUserProjects(currentProjects =>
                currentProjects.filter(p => p.taskId !== taskIdToDelete)
            );

        } catch (error: any) {
            setAppError(error.message || "An error occurred while deleting the project.");
        } finally {
            setConfirmModalState({ isOpen: false, taskIdToDelete: null });
        }
    };

    const handleDebouncedMetadataSave = useCallback((songToSave: Song) => {
        if (!currentUser || !taskId || songToSave.artist === 'Identifying...' || songToSave.artist === '...') {
            return;
        }
        const payload = { songTitle: songToSave.name, artist: songToSave.artist };
        const saveFn = () => saveProjectMetadata(taskId, payload);
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        debounceTimeoutRef.current = setTimeout(saveFn, 750);
    }, [currentUser, taskId]);

    const handleSongNameChange = (name: string) => {
        if (!player.song) return;
        const updatedSong = { ...player.song, name };
        player.setSong(updatedSong);
        handleDebouncedMetadataSave(updatedSong);
    };

    const handleArtistNameChange = (artist: string) => {
        if (!player.song) return;
        const updatedSong = { ...player.song, artist, artistConfirmed: true };
        player.setSong(updatedSong);
        handleDebouncedMetadataSave(updatedSong);
    };

    const handlePlayPause = () => player.isPlaying ? player.pause() : player.play();
    const handleAddBookmark = useCallback(() => setBookmarks(prev => [...prev, { id: Date.now(), time: player.currentTime, label: `Bookmark ${prev.length + 1}` }]), [player.currentTime]);
    const handleDeleteBookmark = useCallback((id: number) => setBookmarks(prev => prev.filter(b => b.id !== id)), []);
    const handleUpdateBookmarkLabel = useCallback((id: number, label: string) => setBookmarks(prev => prev.map(b => (b.id === id ? { ...b, label } : b))), []);

    const handleGoToBookmark = (time: number) => {
        if (player.isLooping) {
            player.onLoopChange(null);
        }
        player.seek(time);
    };

    const handleSendMessage = useCallback(async (query: string) => {
        if (!player.song) return;
        const userMessage: ChatMessage = { role: 'user', content: query };
        setChatMessages(prev => [...prev, userMessage]);
        setIsAssistantLoading(true);
        try {
            const responseText = await getPlayingAdvice({
            songTitle: player.song.name,
            artist: player.song.artist,
            section: query,
            });
            const modelMessage: ChatMessage = { role: 'model', content: responseText };
            setChatMessages(prev => [...prev, modelMessage]);
        } catch (error) {
            const errorMessage: ChatMessage = { role: 'model', content: "Sorry, I couldn't connect to the AI assistant right now." };
            setChatMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsAssistantLoading(false);
        }
    }, [player.song]);

    const handleAnalyzeChords = useCallback(async () => {
        if (!player.song || !currentUser || !taskId) return;
        setIsChordAnalysisLoading(true);
        setChordAnalysisError(null);
        setChordAnalysis(null);
        try {
            const responseText = await analyzeChordsFromStem(currentUser, taskId, player.song.name, player.song.artist); // Changed: Pass song title and artist
            setChordAnalysis(responseText);
        } catch (error: any) {
            setChordAnalysisError(error.message || "An error occurred while analyzing chords. Please try again.");
        } finally {
            setIsChordAnalysisLoading(false);
        }
    }, [player.song, currentUser, taskId]);

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
        if (isProjectLoading || isSeparating || player.isLoading) {
            return (
                <div className="max-w-2xl mx-auto mt-4">
                    <div className="text-center p-10">
                        <div className="w-16 h-16 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="mt-4 text-gray-300 text-lg">
                            {isProjectLoading ? "Loading project..." : isSeparating ? "Separating audio stems..." : "Loading audio..."}
                        </p>
                        {isSeparating && <p className="text-sm text-gray-500">(This can take a minute or two)</p>}
                    </div>
                </div>
            );
        }

       // Logged In, no song
        if (isUserLoading) {
             return (
                <div className="max-w-2xl mx-auto mt-4">
                    <div className="text-center p-10">
                        <div className="w-16 h-16 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="mt-4 text-gray-300 text-lg">Loading...</p>
                    </div>
                </div>
            );
        }

        if (currentUser && !player.song) {
            return (
                <div className="max-w-2xl mx-auto mt-4 space-y-8">
                    <FileUpload onUploadSubmit={handleUploadSubmit} currentUser={currentUser} />
                    <ProjectList
                        projects={userProjects}
                        onLoadProject={(manifestUrl) => {
                            const project = userProjects.find(p => p.manifestUrl === manifestUrl);
                            if (project && currentUser) {
                                const proxyUrl = `${import.meta.env.VITE_API_BASE}/project/${currentUser}/${project.taskId}/manifest`;
                                handleLoadProject(proxyUrl, project.originalFileName);
                            }
                        }}
                        onDeleteProject={handleDeleteProject}
                    />
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
                            loop={player.loop}
                            isLooping={player.isLooping}
                            allowLoopCreation={player.isLooping} // Changed: Loop creation is now enabled only when loop mode is active.
                            onPlayPause={handlePlayPause}
                            onSeek={player.seek}
                            onSpeedChange={player.setPlaybackSpeed}
                            onAddBookmark={handleAddBookmark}
                            onSongNameChange={handleSongNameChange}
                            onArtistNameChange={handleArtistNameChange}
                            onLoopChange={player.onLoopChange}
                            onToggleLoop={player.onToggleLoop}
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
                                    <FileTextIcon className="w-5 h-5"/> Chords
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
                                <ChordAnalysis song={player.song} analysisResult={chordAnalysis} isLoading={isChordAnalysisLoading} error={chordAnalysisError} onAnalyzeChords={handleAnalyzeChords} />
                            </div>
                             <div className={`h-full w-full absolute top-0 left-0 transition-opacity duration-200 ${activeView === 'bookmarks' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                             <BookmarkList bookmarks={bookmarks} onDeleteBookmark={handleDeleteBookmark} onUpdateBookmarkLabel={handleUpdateBookmarkLabel} onGoToBookmark={handleGoToBookmark} />
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Not logged in
        return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} isLoading={isUserLoading} />;
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 lg:p-8 font-sans">
            <header className="mb-8 text-center relative">
                <h1 className="text-4xl font-bold text-white tracking-tight">SongAssist</h1>
                <p className="text-gray-400 mt-1">Your AI-Powered Practice Partner</p>
                {currentUser && (
                    <div className="absolute top-0 right-0 flex items-center gap-4">
                        <span className="text-gray-300">Welcome, <strong className="font-semibold text-white">{currentUser}</strong></span>

                        {player.song && (
                             <button onClick={handleBackToProjects} className="flex items-center gap-2 bg-gray-700 hover:bg-teal-800/50 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                                <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18M3 14h18M10 3v18"/></svg>
                                Projects
                            </button>
                        )}

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

            <ConfirmationModal
                isOpen={confirmModalState.isOpen}
                onClose={() => setConfirmModalState({ isOpen: false, taskIdToDelete: null })}
                onConfirm={executeDeleteProject}
                title="Delete Project"
                message="Are you sure you want to permanently delete this project? This action cannot be undone."
            />
        </div>
    );
};

export default App;