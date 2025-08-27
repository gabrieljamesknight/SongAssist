import { createContext, useContext, FC, ReactNode, useState } from 'react';
import { useAudioPlayer, AudioPlayerControls } from '../hooks/useAudioPlayer';

export type ExtendedAudioPlayerControls = AudioPlayerControls & {
  loop: { start: number; end: number } | null;
  savedLoop: { start: number; end: number } | null;
  isLooping: boolean;
  onLoopChange: (loop: { start: number; end: number } | null) => void;
  onToggleLoop: () => void;
};

const AudioPlayerContext = createContext<ExtendedAudioPlayerControls | undefined>(undefined);

export const AudioPlayerProvider: FC<{children: ReactNode}> = ({ children }) => {
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const [savedLoop, setSavedLoop] = useState<{ start: number; end: number } | null>(null);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  const audioPlayer = useAudioPlayer({ loop, isLooping });

  const handleLoopChange = (newLoop: { start: number; end: number } | null) => {
    setLoop(newLoop);
    if (newLoop !== null) {
      setSavedLoop(null);
    }
    if (newLoop === null) {
      setIsLooping(false);
    }
  };

  const handleToggleLoop = () => {
    if (loop) {
      setSavedLoop(loop);
      setLoop(null);
      setIsLooping(false);
    } else {
      if (savedLoop) {
        setLoop(savedLoop);
        setSavedLoop(null);
        setIsLooping(true);
        audioPlayer.seek(savedLoop.start);
      } else if (audioPlayer.song && audioPlayer.song.duration > 10) {
        const duration = audioPlayer.song.duration;
        const middle = duration / 2;
        const startTime = Math.max(0, middle - 5);
        const endTime = Math.min(duration, middle + 5);
        const newLoop = { start: startTime, end: endTime };
        
        setLoop(newLoop);
        setIsLooping(true);
        audioPlayer.seek(startTime);
      }
    }
  };
  
  const value: ExtendedAudioPlayerControls = {
    ...audioPlayer,
    loop,
    savedLoop,
    isLooping,
    onLoopChange: handleLoopChange,
    onToggleLoop: handleToggleLoop,
    load: async (urls, details) => {
      setLoop(null);
      setSavedLoop(null);
      setIsLooping(false);
      await audioPlayer.load(urls, details);
    },
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayerContext = (): ExtendedAudioPlayerControls => {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayerContext must be used within an AudioPlayerProvider');
  }
  return context;
};