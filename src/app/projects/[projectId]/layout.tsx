export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import CommandPaletteProvider from '@/components/command/CommandPaletteProvider';

async function getProject(id: string) {
  try {
    const { projectService } = await import('@/server/services/project.service');
    return projectService.getProject(id);
  } catch {
    return null;
  }
}

type Props = { children: React.ReactNode; params: Promise<{ projectId: string }> };

export default async function ProjectLayout({ children, params }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <div className="flex h-screen overflow-hidden bg-bg-0">
      {/* Mobile: hide sidebar, show bottom nav */}
      <div className="hidden md:flex">
        <Sidebar projectId={projectId} projectName={project.name} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header projectName={project.name} projectId={projectId} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      <CommandPaletteProvider projectId={projectId} />
    </div>
  );
}
