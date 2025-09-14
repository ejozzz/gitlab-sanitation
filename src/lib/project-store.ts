import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectStore {
  activeProjectId: string | null;
  setActiveProject: (projectId: string) => void;
  clearActiveProject: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      activeProjectId: null,
      setActiveProject: (projectId) => {
        console.log('ProjectStore: Setting active project to:', projectId);
        set({ activeProjectId: projectId });
      },
      clearActiveProject: () => {
        console.log('ProjectStore: Clearing active project');
        set({ activeProjectId: null });
      },
    }),
    {
      name: 'project-store',
      // Add this to ensure state changes trigger re-renders
      partialize: (state) => ({ activeProjectId: state.activeProjectId }),
    }
  )
);