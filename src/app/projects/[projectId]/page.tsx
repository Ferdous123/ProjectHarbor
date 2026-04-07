import DashboardMetrics from '@/components/dashboard/DashboardMetrics';
import QuickActions from '@/components/dashboard/QuickActions';
import JobList from '@/components/dashboard/JobList';
import AgentBanner from '@/components/dashboard/AgentBanner';
import ActivityTimeline from '@/components/dashboard/ActivityTimeline';

type Props = { params: Promise<{ projectId: string }> };

export default async function ProjectDashboard({ params }: Props) {
  const { projectId } = await params;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <AgentBanner />
      <DashboardMetrics projectId={projectId} />
      <div className="grid md:grid-cols-2 gap-4">
        <QuickActions projectId={projectId} />
        <JobList projectId={projectId} />
      </div>
      <ActivityTimeline projectId={projectId} />
    </div>
  );
}
