import { useState, useRef, useCallback, useEffect } from 'react';
import { Stem, Song } from '../types';

export type AudioPlayerOptions = {
    loop: { start: number; end: number; } | null;
    isLooping: boolean;
};

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
    setPlaybackSpeed: (speed: number | ((prevSpeed: number) => number)) => void;
    setSong: React.Dispatch<React.SetStateAction<Song | null>>;
};

export const useAudioPlayer = (options: AudioPlayerOptions): AudioPlayerControls => {
    const { loop, isLooping } = options;
    const [song, setSong] = useState<Song | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [stemVolumes, setStemVolumes] = useState<Record<Stem, number>>({ guitar: 100, backingTrack: 100 });
    const [playbackSpeed, setPlaybackSpeedState] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs for HTML audio elements (used to preserve pitch while changing speed)
    const audioElsRef = useRef<Record<Stem, HTMLAudioElement | null>>({ guitar: null, backingTrack: null });
    
    // Ref to hold playback state, used to stabilize callback functions
    const playbackStateRef = useRef({
        isPlaying: false,
        pausedAt: 0, 
        startedAt: 0,
        currentSpeed: 1,
    });

    // Effect to keep the state ref synchronized with the latest state values
    useEffect(() => {
        playbackStateRef.current.isPlaying = isPlaying;
        playbackStateRef.current.currentSpeed = playbackSpeed;
    }, [isPlaying, playbackSpeed]);

    const stopPlayback = useCallback(() => {
        const { guitar, backingTrack } = audioElsRef.current;
        try { guitar?.pause(); } catch {}
        try { backingTrack?.pause(); } catch {}
    }, []);

    const ensureAudioElements = useCallback(() => {
        (['guitar', 'backingTrack'] as Stem[]).forEach((stem) => {
            if (!audioElsRef.current[stem]) {
                const el = new Audio();
                // Try to preserve pitch across browsers
                try { (el as any).preservesPitch = true; } catch {}
                try { (el as any).mozPreservesPitch = true; } catch {}
                try { (el as any).webkitPreservesPitch = true; } catch {}
                el.preload = 'auto';
                el.crossOrigin = 'anonymous';
                audioElsRef.current[stem] = el;
            }
        });
        return audioElsRef.current;
    }, []);

    const play = useCallback(async () => {
        ensureAudioElements();
        const { guitar, backingTrack } = audioElsRef.current;
        if (!guitar || !backingTrack) return;

        // Stop any existing playback first
        stopPlayback();

        // Sync position and speed
        const targetTime = Math.max(0, playbackStateRef.current.pausedAt);
        try { guitar.currentTime = targetTime; } catch {}
        try { backingTrack.currentTime = targetTime; } catch {}

        [guitar, backingTrack].forEach((el) => {
            el.playbackRate = playbackStateRef.current.currentSpeed;
            try { (el as any).preservesPitch = true; } catch {}
            try { (el as any).mozPreservesPitch = true; } catch {}
            try { (el as any).webkitPreservesPitch = true; } catch {}
        });

        // Apply current volumes
        guitar.volume = stemVolumes.guitar / 100;
        backingTrack.volume = stemVolumes.backingTrack / 100;

        // Start playback, ignore promise errors in test/jsdom
        try { await guitar.play(); } catch {}
        try { await backingTrack.play(); } catch {}

        // Mark playing and set start time for UI timing
        playbackStateRef.current.startedAt = performance.now() / 1000;
        setIsPlaying(true);
    }, [ensureAudioElements, stopPlayback, stemVolumes.guitar, stemVolumes.backingTrack]);

    const pause = useCallback(() => {
        if (!playbackStateRef.current.isPlaying) return;
        const { guitar, backingTrack } = audioElsRef.current;
        try { guitar?.pause(); } catch {}
        try { backingTrack?.pause(); } catch {}
        const t = guitar ? guitar.currentTime : (backingTrack ? backingTrack.currentTime : 0);
        playbackStateRef.current.pausedAt = t || 0;
        setCurrentTime(playbackStateRef.current.pausedAt);
        setIsPlaying(false);
    }, []);

    const seek = useCallback((time: number) => {
        if (!song) return;
        const newTime = Math.max(0, Math.min(time, song.duration));

        const { guitar, backingTrack } = audioElsRef.current;
        if (guitar) { try { guitar.currentTime = newTime; } catch {} }
        if (backingTrack) { try { backingTrack.currentTime = newTime; } catch {} }

        playbackStateRef.current.pausedAt = newTime;
        setCurrentTime(newTime);

        // If it was playing, restart playback from new position
        if (playbackStateRef.current.isPlaying) {
            play();
        }
    }, [song, play]);

    const setPlaybackSpeed = useCallback((speed: number | ((prevSpeed: number) => number)) => {
        const newSpeed = typeof speed === 'function' ? speed(playbackStateRef.current.currentSpeed) : speed;

        const { guitar, backingTrack } = audioElsRef.current;
        [guitar, backingTrack].forEach((el) => {
            if (el) {
                el.playbackRate = newSpeed;
                try { (el as any).preservesPitch = true; } catch {}
                try { (el as any).mozPreservesPitch = true; } catch {}
                try { (el as any).webkitPreservesPitch = true; } catch {}
            }
        });

        setPlaybackSpeedState(newSpeed);
    }, []);

    const load = useCallback(async (stemUrls: Record<string, string>, songDetails: { name: string, artist: string }) => {
        setIsLoading(true);
        setError(null);
        
        if (playbackStateRef.current.isPlaying) {
            pause();
        }
        setCurrentTime(0);
        setPlaybackSpeedState(1);
        playbackStateRef.current.pausedAt = 0;

        const decodingContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        try {
            ensureAudioElements();
            const [guitarRes, backingRes] = await Promise.all([fetch(stemUrls.guitar), fetch(stemUrls.backingTrack)]);
            if (!guitarRes.ok || !backingRes.ok) throw new Error("Failed to fetch audio files.");

            const [guitarArrayBuffer, backingArrayBuffer] = await Promise.all([guitarRes.arrayBuffer(), backingRes.arrayBuffer()]);
            const [decodedGuitar] = await Promise.all([
                decodingContext.decodeAudioData(guitarArrayBuffer),
            ]);

            // Wire up HTML audio elements
            const { guitar, backingTrack } = audioElsRef.current;
            if (guitar) {
                guitar.src = stemUrls.guitar;
                guitar.playbackRate = 1;
                guitar.volume = stemVolumes.guitar / 100;
                try { (guitar as any).preservesPitch = true; } catch {}
                try { (guitar as any).mozPreservesPitch = true; } catch {}
                try { (guitar as any).webkitPreservesPitch = true; } catch {}
            }
            if (backingTrack) {
                backingTrack.src = stemUrls.backingTrack;
                backingTrack.playbackRate = 1;
                backingTrack.volume = stemVolumes.backingTrack / 100;
                try { (backingTrack as any).preservesPitch = true; } catch {}
                try { (backingTrack as any).mozPreservesPitch = true; } catch {}
                try { (backingTrack as any).webkitPreservesPitch = true; } catch {}
            }
            
            setSong({ 
                ...songDetails, 
                duration: decodedGuitar.duration,
                artistConfirmed: false,
                stemUrls: stemUrls,
            });
        } catch (err) {
            console.error(err);
            setError("Failed to load audio. The file might be unsupported.");
            setSong(null);
        } finally {
            setIsLoading(false);
            decodingContext.close();
        }
    }, [pause, ensureAudioElements, stemVolumes.guitar, stemVolumes.backingTrack]);

    // Effect for updating stem volumes
    useEffect(() => {
        const { guitar, backingTrack } = audioElsRef.current;
        if (guitar) guitar.volume = Math.max(0, Math.min(1, stemVolumes.guitar / 100));
        if (backingTrack) backingTrack.volume = Math.max(0, Math.min(1, stemVolumes.backingTrack / 100));
    }, [stemVolumes]);

    // Effect for updating the UI timer using media element time
    useEffect(() => {
        let animationFrameId: number;
        const update = () => {
            if (playbackStateRef.current.isPlaying && song?.duration) {
                const t = audioElsRef.current.guitar?.currentTime ?? audioElsRef.current.backingTrack?.currentTime ?? 0;
                const newCurrentTime = Math.max(0, Math.min(t, song.duration));

                if (isLooping && loop && newCurrentTime >= loop.end) {
                    seek(loop.start);
                } else if (newCurrentTime < song.duration) {
                    setCurrentTime(newCurrentTime);
                    playbackStateRef.current.pausedAt = newCurrentTime;
                } else {
                    // Song finished
                    setCurrentTime(song.duration);
                    setIsPlaying(false);
                    stopPlayback();
                    playbackStateRef.current.pausedAt = 0;
                }
            }
            animationFrameId = requestAnimationFrame(update);
        };

        if (isPlaying) {
            animationFrameId = requestAnimationFrame(update);
        }

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, song?.duration, stopPlayback, loop, isLooping, seek]);

    return { 
        song, 
        isPlaying, 
        currentTime, 
        isLoading, 
        error, 
        stemVolumes, 
        playbackSpeed, 
        load, 
        play, 
        pause, 
        seek, 
        setStemVolumes, 
        setPlaybackSpeed,
        setSong 
    };
};
