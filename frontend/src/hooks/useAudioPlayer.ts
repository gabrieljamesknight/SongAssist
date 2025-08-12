import { useState, useRef, useCallback, useEffect } from 'react';
import { Stem, Song } from '../types';

export type AudioPlayerControls = {
    song: Song | null;
    isPlaying: boolean;
    currentTime: number;
    isLoading: boolean;
    error: string | null;
    stemVolumes: Record<Stem, number>;
    playbackSpeed: number;
    load: (stemUrls: Record<string, string>, songDetails: { name: string, artist: string }) => Promise<void>;
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    setStemVolumes: React.Dispatch<React.SetStateAction<Record<Stem, number>>>;
    setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
    setSong: React.Dispatch<React.SetStateAction<Song | null>>;
};

export const useAudioPlayer = (): AudioPlayerControls => {
    const [song, setSong] = useState<Song | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [stemVolumes, setStemVolumes] = useState<Record<Stem, number>>({ guitar: 100, backingTrack: 100 });
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs for the Audio API nodes
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourcesRef = useRef<Record<Stem, AudioBufferSourceNode | null>>({ guitar: null, backingTrack: null });
    const gainsRef = useRef<Record<Stem, GainNode | null>>({ guitar: null, backingTrack: null });
    const buffersRef = useRef<Record<Stem, AudioBuffer | null>>({ guitar: null, backingTrack: null });
    
    // Ref to hold playback state, used to stabilize callback functions
    const playbackStateRef = useRef({
        isPlaying: false,
        pausedAt: 0,
        startedAt: 0,
        playbackSpeed: 1,
    });

    // Effect to keep the state ref synchronized with the latest state values
    useEffect(() => {
        playbackStateRef.current.isPlaying = isPlaying;
        playbackStateRef.current.playbackSpeed = playbackSpeed;
    }, [isPlaying, playbackSpeed]);

    const stopPlayback = useCallback(() => {
        Object.values(sourcesRef.current).forEach(source => {
            if (source) {
                source.onended = null;
                try { source.stop(); } catch (e) { /* ignore */ }
            }
        });
        sourcesRef.current = { guitar: null, backingTrack: null };
    }, []);

    const initAudioContext = useCallback(() => {
        if (audioContextRef.current) return audioContextRef.current;
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = context;
            
            const guitarGain = context.createGain();
            guitarGain.connect(context.destination);
            gainsRef.current.guitar = guitarGain;

            const backingGain = context.createGain();
            backingGain.connect(context.destination);
            gainsRef.current.backingTrack = backingGain;
            
            return context;
        } catch (e) {
            setError("Web Audio API is not supported by this browser.");
            return null;
        }
    }, []);

    const play = useCallback(async () => {
        const context = initAudioContext();
        if (!context) return;
        
        if (context.state === 'suspended') await context.resume();
        
        const guitarBuffer = buffersRef.current.guitar;
        const backingBuffer = buffersRef.current.backingTrack;
        const guitarGain = gainsRef.current.guitar;
        const backingGain = gainsRef.current.backingTrack;

        if (!guitarBuffer || !backingBuffer || !guitarGain || !backingGain) return;

        stopPlayback();

        const createAndStartSource = (buffer: AudioBuffer, gainNode: GainNode): AudioBufferSourceNode => {
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = playbackStateRef.current.playbackSpeed;
            source.connect(gainNode);
            source.start(0, Math.max(0, playbackStateRef.current.pausedAt));
            return source;
        };

        sourcesRef.current.guitar = createAndStartSource(guitarBuffer, guitarGain);
        sourcesRef.current.backingTrack = createAndStartSource(backingBuffer, backingGain);

        sourcesRef.current.guitar.onended = () => {
            if (playbackStateRef.current.isPlaying) {
                setIsPlaying(false);
                setCurrentTime(0);
                playbackStateRef.current.pausedAt = 0;
            }
        };

        playbackStateRef.current.startedAt = context.currentTime - playbackStateRef.current.pausedAt / playbackStateRef.current.playbackSpeed;
        setIsPlaying(true);
    }, [initAudioContext, stopPlayback]);

    const pause = useCallback(() => {
        const context = audioContextRef.current;
        if (!context || !playbackStateRef.current.isPlaying) return;

        const elapsedSinceStart = (context.currentTime - playbackStateRef.current.startedAt) * playbackStateRef.current.playbackSpeed;
        playbackStateRef.current.pausedAt = elapsedSinceStart;
        
        stopPlayback();
        setIsPlaying(false);
    }, [stopPlayback]);

    const seek = useCallback((time: number) => {
        if (!song) return;
        const newTime = Math.max(0, Math.min(time, song.duration));
        playbackStateRef.current.pausedAt = newTime;
        setCurrentTime(newTime);
        if (playbackStateRef.current.isPlaying) {
            play();
        }
    }, [song, play]);

    const load = useCallback(async (stemUrls: Record<string, string>, songDetails: { name: string, artist: string }) => {
        setIsLoading(true);
        setError(null);
        
        if (playbackStateRef.current.isPlaying) {
            pause();
        }
        setCurrentTime(0);
        playbackStateRef.current.pausedAt = 0;

        const decodingContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        try {
            initAudioContext();
            const [guitarRes, backingRes] = await Promise.all([fetch(stemUrls.guitar), fetch(stemUrls.backingTrack)]);
            if (!guitarRes.ok || !backingRes.ok) throw new Error("Failed to fetch audio files.");

            const [guitarArrayBuffer, backingArrayBuffer] = await Promise.all([guitarRes.arrayBuffer(), backingRes.arrayBuffer()]);
            const [decodedGuitar, decodedBacking] = await Promise.all([
                decodingContext.decodeAudioData(guitarArrayBuffer),
                decodingContext.decodeAudioData(backingArrayBuffer)
            ]);

            buffersRef.current.guitar = decodedGuitar;
            buffersRef.current.backingTrack = decodedBacking;
            
            setSong({ ...songDetails, duration: decodedGuitar.duration });
        } catch (err) {
            console.error(err);
            setError("Failed to load audio. The file might be unsupported.");
            setSong(null);
        } finally {
            setIsLoading(false);
            decodingContext.close();
        }
    }, [pause, initAudioContext]);

    useEffect(() => {
        const context = audioContextRef.current;
        const guitarGain = gainsRef.current.guitar;
        const backingGain = gainsRef.current.backingTrack;

        if (context && context.state === 'running' && guitarGain && backingGain) {
            guitarGain.gain.setTargetAtTime(stemVolumes.guitar / 100, context.currentTime, 0.01);
            backingGain.gain.setTargetAtTime(stemVolumes.backingTrack / 100, context.currentTime, 0.01);
        }
    }, [stemVolumes]);

    useEffect(() => {
        let animationFrameId: number;
        const update = () => {
            const context = audioContextRef.current;
            if (isPlaying && context && song?.duration) {
                const elapsed = (context.currentTime - playbackStateRef.current.startedAt) * playbackSpeed;
                if (elapsed < song.duration) {
                    setCurrentTime(elapsed);
                } else {
                    setCurrentTime(song.duration);
                    pause();
                }
            }
            animationFrameId = requestAnimationFrame(update);
        };
        if (isPlaying) {
            animationFrameId = requestAnimationFrame(update);
        }
        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, song?.duration, playbackSpeed, pause]);

    return { song, isPlaying, currentTime, isLoading, error, stemVolumes, playbackSpeed, load, play, pause, seek, setStemVolumes, setPlaybackSpeed, setSong };
};
