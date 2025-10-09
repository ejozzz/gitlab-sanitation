// src/lib/project-store.ts
import { create } from 'zustand';
import { persist, PersistOptions } from 'zustand/middleware';

interface ProjectStore {
  activeProjectId: string | null;
  setActiveProject: (projectId: string) => void;
  clearActiveProject: () => void;
  loaded: boolean;
  setLoaded: (v: boolean) => void; // <-- 1. setter
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      activeProjectId: null,
      loaded: false,
      setActiveProject: (projectId) => {
        set({ activeProjectId: projectId });
      },
      clearActiveProject: () => {
        set({ activeProjectId: null });
      },
      setLoaded: (v) => set({ loaded: v }), // <-- 2. implement
    }),
    {
      name: 'project-store',
      // 3. fire when hydration finishes
      onRehydrateStorage: () => (state) => state?.setLoaded(true),
    } as PersistOptions<ProjectStore>
  )
);