import type { FC } from 'react';
import { Bookmark } from '../types';
import { TrashIcon } from './Icons';

interface BookmarkListProps {
  bookmarks: Bookmark[];
  onDeleteBookmark: (id: number) => void;
  onUpdateBookmarkLabel: (id: number, label: string) => void;
  onGoToBookmark: (bookmark: Bookmark) => void; // Prop updated to accept the full bookmark object.
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

const BookmarkList: React.FC<BookmarkListProps> = ({ bookmarks, onDeleteBookmark, onUpdateBookmarkLabel, onGoToBookmark }) => {
  return (
    <div className="h-full flex flex-col">
       <div className="flex justify-between items-center mb-4 flex-shrink-0">
         <h3 className="text-xl font-bold text-white">Bookmarked Loops</h3>
       </div>
      {(!Array.isArray(bookmarks) || bookmarks.length === 0) ? (
        <div className="flex-grow flex items-center justify-center text-gray-500">
          <p>No saved loops.</p>
        </div>
      ) : (
        <ul className="space-y-3 overflow-y-auto flex-grow">
          {bookmarks.sort((a,b) => a.start - b.start).map((bookmark) => (
            <li key={bookmark.id} className="bg-gray-700/50 p-3 rounded-lg flex items-center gap-4">
              <button onClick={() => onGoToBookmark(bookmark)} className="font-mono text-lg text-purple-400 hover:text-purple-300 bg-gray-900/50 px-3 py-1 rounded-md">
                {formatTime(bookmark.start)} - {formatTime(bookmark.end)}
              </button>
              <input
                type="text"
                value={bookmark.label}
                onChange={(e) => onUpdateBookmarkLabel(bookmark.id, e.target.value)}
                placeholder="Add a label..."
                className="flex-grow bg-transparent focus:outline-none focus:ring-1 focus:ring-purple-500 rounded px-2 py-1 text-white"
              />
              <button onClick={() => onDeleteBookmark(bookmark.id)} className="text-gray-500 hover:text-red-500 transition-colors p-1">
                <TrashIcon className="w-5 h-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BookmarkList;