import { createContext, useContext, FC, ReactNode } from 'react';
import { useAudioPlayer, AudioPlayerControls } from '../hooks/useAudioPlayer';


const AudioPlayerContext = createContext<AudioPlayerControls | undefined>(undefined);


export const AudioPlayerProvider: FC<{children: ReactNode}> = ({ children }) => {
  const audioPlayer = useAudioPlayer();
  return (
    <AudioPlayerContext.Provider value={audioPlayer}>
      {children}
    </AudioPlayerContext.Provider>
  );
};


export const useAudioPlayerContext = (): AudioPlayerControls => {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayerContext must be used within an AudioPlayerProvider');
  }
  return context;
};
