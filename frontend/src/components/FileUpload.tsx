import { useState, useCallback, FC } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, Music } from 'lucide-react';

interface FileUploadProps {
  // Update the callback to include the taskId from the backend
  onUploadSubmit: (originalFile: File, taskId: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUploadSubmit }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/*': ['.mp3', '.wav', '.flac', '.m4a'] },
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/separate/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to start separation.');
      }
      
      // Get the taskId from the response
      const data = await response.json();
      
      // Call the parent component's callback with the original file and the new taskId
      onUploadSubmit(file, data.taskId);

    } catch (err) {
      if (err instanceof Error) {
        setError(`Upload failed: ${err.message}`);
      } else {
        setError('An unexpected error occurred.');
      }
      setIsLoading(false); 
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-gray-800/50 p-8 border-2 border-dashed border-gray-600 rounded-2xl text-center transition-all hover:border-teal-400 hover:bg-gray-800">
      <div {...getRootProps()} className="cursor-pointer p-10 rounded-lg transition-colors bg-gray-900/50 hover:bg-gray-900">
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-4 font-semibold text-white">
          {isDragActive ? "Drop the audio file here..." : "Drag 'n' drop an audio file, or click to select"}
        </p>
        <p className="text-xs text-gray-500 mt-1">Supports MP3, WAV, FLAC, M4A</p>
      </div>
      {file && (
        <div className="mt-4 text-sm text-gray-300 flex items-center justify-center bg-teal-900/50 py-2 px-4 rounded-md">
          <Music className="mr-2 h-4 w-4 text-teal-400" />
          <span>{file.name}</span>
        </div>
      )}
      <button 
        onClick={handleUpload} 
        disabled={isLoading || !file} 
        className="mt-6 w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : (
          'Separate Guitar & Backing Track'
        )}
      </button>
      {error && <p className="mt-4 text-red-400">{error}</p>}
    </div>
  );
};
