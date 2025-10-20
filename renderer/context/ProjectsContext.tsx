import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

type Project = {
  id: string;
  name: string;
  description?: string;
  created: number;
  updated: number;
  files?: Record<string, string>;
};

type ProjectsContextValue = {
  projects: Project[];
  currentProject: Project | null;
  createProject: (name: string, description?: string) => Promise<Project>;
  loadProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
};

const STORAGE_KEY = "gemini_projects";

const ProjectsContext = createContext<ProjectsContextValue | undefined>(
  undefined
);

function readStoredProjects(): Project[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[ProjectsContext] Failed to read projects:", err);
    return [];
  }
}

export const ProjectsProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>(() => readStoredProjects());
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const persistProjects = useCallback((next: Project[]) => {
    setProjects(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const refreshProjects = useCallback(async () => {
    persistProjects(readStoredProjects());
  }, [persistProjects]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const createProject = useCallback(
    async (name: string, description?: string) => {
      const now = Date.now();
      const project: Project = {
        id: generateId(),
        name,
        description,
        created: now,
        updated: now,
        files: {},
      };
      persistProjects([...projects, project]);
      return project;
    },
    [persistProjects, projects]
  );

  const loadProject = useCallback(async (id: string) => {
    const found =
      projects.find((p) => p.id === id) ??
      readStoredProjects().find((p) => p.id === id) ??
      null;
    setCurrentProject(found ?? null);
  }, [projects]);

  const deleteProject = useCallback(
    async (id: string) => {
      const remaining = projects.filter((p) => p.id !== id);
      persistProjects(remaining);
      if (currentProject?.id === id) setCurrentProject(null);
    },
    [projects, persistProjects, currentProject]
  );

  const renameProject = useCallback(
    async (id: string, name: string) => {
      const now = Date.now();
      const updated = projects.map((project) =>
        project.id === id
          ? { ...project, name, updated: now }
          : project
      );
      persistProjects(updated);
      if (currentProject?.id === id) {
        setCurrentProject({ ...currentProject, name, updated: now });
      }
    },
    [projects, persistProjects, currentProject]
  );

  const value = useMemo<ProjectsContextValue>(() => ({
    projects,
    currentProject,
    createProject,
    loadProject,
    deleteProject,
    renameProject,
    refreshProjects,
  }), [
    projects,
    currentProject,
    createProject,
    loadProject,
    deleteProject,
    renameProject,
    refreshProjects,
  ]);

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
};

export const useProjects = (): ProjectsContextValue => {
  const ctx = useContext(ProjectsContext);
  if (!ctx) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return ctx;
};
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${random}-${Date.now().toString(36)}`;
}
