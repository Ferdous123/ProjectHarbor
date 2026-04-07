export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { Plus, FolderOpen, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';

async function getProjects() {
  try {
    const { projectService } = await import('@/server/services/project.service');
    return projectService.listProjects();
  } catch {
    return [];
  }
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="min-h-screen bg-bg-0 text-text-primary p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">ProjectHarbor</h1>
            <p className="text-text-secondary text-sm mt-0.5">Research operations platform</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/github">
              <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                <GitBranch className="w-4 h-4" /> GitHub
              </Button>
            </Link>
            <Link href="/projects/new">
              <Button size="sm" className="flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> New Project
              </Button>
            </Link>
          </div>
        </div>

        {/* Project list */}
        {projects.length === 0 ? (
          <div className="border border-bg-4 rounded bg-bg-1 p-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto text-text-tertiary mb-3" strokeWidth={1} />
            <p className="text-text-secondary text-sm">No projects yet.</p>
            <Link href="/projects/new">
              <Button variant="outline" size="sm" className="mt-4">Create your first project</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <div className="border border-bg-4 rounded bg-bg-1 px-5 py-4 hover:bg-bg-2 transition-colors flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary text-sm">{project.name}</span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        project.status === 'active' ? 'bg-accent-green' : 'bg-bg-4'
                      }`} />
                    </div>
                    {project.description && (
                      <p className="text-text-secondary text-xs mt-0.5 truncate">{project.description}</p>
                    )}
                    <p className="text-text-tertiary text-xs mt-0.5">{project.remoteDir}</p>
                  </div>
                  <span className="text-text-tertiary text-xs shrink-0">{project.category}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
