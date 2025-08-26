import { FC } from 'react';
import { FolderClock } from 'lucide-react';
import { Project } from '../types';
import { TrashIcon } from './Icons'; // New import

interface ProjectListProps {
  projects: Project[];
  onLoadProject: (manifestUrl:string) => void;
  onDeleteProject: (taskId: string) => void;
}

export const ProjectList: FC<ProjectListProps> = ({ projects, onLoadProject, onDeleteProject }) => { // Add onDeleteProject to destructuring
  // User has no projects yet
  if (!projects || projects.length === 0) {
    return (
      <div className="bg-gray-800/50 p-6 rounded-2xl border-2 border-dashed border-gray-600">
        <div className="text-center">
          <FolderClock className="mx-auto h-10 w-10 text-gray-500" />
          <h3 className="mt-2 text-lg font-medium text-white">No Projects Found</h3>
          <p className="mt-1 text-sm text-gray-400">
            Upload your first song above to get started!
          </p>
        </div>
      </div>
    );
  }

  // List of projects if they exist
  return (
    <div className="bg-gray-800/50 p-6 rounded-2xl">
      <h3 className="text-xl font-bold text-white mb-4">
        Load a Previous Project
      </h3>
      <div className="max-h-60 overflow-y-auto pr-2">
        <ul className="space-y-3">
          {projects.map((project) => (
            <li key={project.taskId} className="flex items-center gap-2">
              <button
                onClick={() => onLoadProject(project.manifestUrl)}
                className="w-full text-left p-4 flex items-center gap-4 bg-gray-900/50 hover:bg-teal-900/50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <FolderClock className="h-5 w-5 text-teal-400 flex-shrink-0" />
                <span className="text-gray-200 font-medium truncate" title={project.originalFileName}>
                  {project.originalFileName}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteProject(project.taskId); }}
                className="p-3 text-gray-500 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors flex-shrink-0"
                aria-label={`Delete project ${project.originalFileName}`}
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};