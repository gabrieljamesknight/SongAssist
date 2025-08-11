import { useState, useRef, useCallback, useEffect } from 'react';
import { Stem, Song } from '../types';

export const useAudioPlayer = () => {
    const [song, setSong] = useState<Song | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [stemVolumes, setStemVolumes] = useState<Record<Stem, number>>({ guitar: 100, backingTrack: 100 });
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isLoading, setIsLoading] = useState(false); 
    const [error, setError] = useState<string | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const guitarSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const backingSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const guitarGainRef = useRef<GainNode | null>(null);
    const backingGainRef = useRef<GainNode | null>(null);
    const guitarBufferRef = useRef<AudioBuffer | null>(null);
    const backingBufferRef = useRef<AudioBuffer | null>(null);
    const pausedAtRef = useRef<number>(0);
    const startedAtRef = useRef<number>(0);

    const stopPlayback = useCallback(() => {
        const stopSource = (sourceRef: React.MutableRefObject<AudioBufferSourceNode | null>) => {
            if (sourceRef.current) {
                sourceRef.current.onended = null;
                try { sourceRef.current.stop(); } catch (e) { /* ignore */ }
                sourceRef.current = null;
            }
        };
        stopSource(guitarSourceRef);
        stopSource(backingSourceRef);
    }, []);

    const play = useCallback(async () => {
        let context = audioContextRef.current;
        if (!context) {
            try {
                context = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = context;
                const guitarGain = context.createGain();
                guitarGain.connect(context.destination);
                guitarGainRef.current = guitarGain;
                const backingGain = context.createGain();
                backingGain.connect(context.destination);
                backingGainRef.current = backingGain;
            } catch (e) {
                setError("Web Audio API is not supported by this browser.");
                return;
            }
        }
        if (context.state === 'suspended') await context.resume();
        if (!guitarBufferRef.current || !backingBufferRef.current || !guitarGainRef.current || !backingGainRef.current) return;
        stopPlayback();
        const createAndStartSource = (buffer: AudioBuffer, gainNode: GainNode) => {
            const source = context!.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = playbackSpeed;
            source.connect(gainNode);
            source.start(0, Math.max(0, pausedAtRef.current));
            return source;
        };
        guitarSourceRef.current = createAndStartSource(guitarBufferRef.current, guitarGainRef.current);
        backingSourceRef.current = createAndStartSource(backingBufferRef.current, backingGainRef.current);
        guitarSourceRef.current.onended = () => {
            if (isPlaying) {
                setIsPlaying(false);
                setCurrentTime(0);
                pausedAtRef.current = 0;
            }
        };
        startedAtRef.current = context.currentTime - pausedAtRef.current / playbackSpeed;
        setIsPlaying(true);
    }, [stopPlayback, isPlaying, playbackSpeed]);

    const pause = useCallback(() => {
        const context = audioContextRef.current;
        if (!context) return;
        const elapsedSinceStart = (context.currentTime - startedAtRef.current) * playbackSpeed;
        pausedAtRef.current = elapsedSinceStart;
        stopPlayback();
        setIsPlaying(false);
    }, [playbackSpeed, stopPlayback]);

    const seek = useCallback((time: number) => {
        if (!song) return;
        const newTime = Math.max(0, Math.min(time, song.duration));
        pausedAtRef.current = newTime;
        setCurrentTime(newTime);
        if (isPlaying) play();
    }, [isPlaying, song, play]);


    const load = useCallback(async (stemUrls: Record<string, string>, songDetails: { name: string, artist: string }) => {
        // Set the loading flag to true when starting
        setIsLoading(true);
        setError(null);
        if (isPlaying) pause();

        const decodingContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        try {
            const [guitarRes, backingRes] = await Promise.all([fetch(stemUrls.guitar), fetch(stemUrls.backingTrack)]);
            if (!guitarRes.ok || !backingRes.ok) throw new Error("Failed to fetch audio files.");
            const [guitarArrayBuffer, backingArrayBuffer] = await Promise.all([guitarRes.arrayBuffer(), backingRes.arrayBuffer()]);
            const [decodedGuitar, decodedBacking] = await Promise.all([
                decodingContext.decodeAudioData(guitarArrayBuffer),
                decodingContext.decodeAudioData(backingArrayBuffer)
            ]);
            guitarBufferRef.current = decodedGuitar;
            backingBufferRef.current = decodedBacking;
            setSong({ ...songDetails, duration: decodedGuitar.duration });
            setCurrentTime(0);
            pausedAtRef.current = 0;
        } catch (err) {
            setError("Failed to load audio. The file might be unsupported.");
            setSong(null);
        } finally {
            // Set the loading flag to false when finished (either in success or error)
            setIsLoading(false);
            decodingContext.close();
        }
    }, [isPlaying, pause]);

    useEffect(() => {
        const context = audioContextRef.current;
        if (context && context.state === 'running' && guitarGainRef.current && backingGainRef.current) {
            guitarGainRef.current.gain.setTargetAtTime(stemVolumes.guitar / 100, context.currentTime, 0.01);
            backingGainRef.current.gain.setTargetAtTime(stemVolumes.backingTrack / 100, context.currentTime, 0.01);
        }
    }, [stemVolumes, isPlaying]);

    useEffect(() => {
        let animationFrameId: number;
        const update = () => {
            if (isPlaying && audioContextRef.current && song?.duration) {
                const elapsed = (audioContextRef.current.currentTime - startedAtRef.current) * playbackSpeed;
                if (elapsed < song.duration) setCurrentTime(elapsed);
            }
            animationFrameId = requestAnimationFrame(update);
        };
        if (isPlaying) animationFrameId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, song?.duration, playbackSpeed]);

    return { song, isPlaying, currentTime, isLoading, error, stemVolumes, playbackSpeed, load, play, pause, seek, setStemVolumes, setPlaybackSpeed, setSong };
};
