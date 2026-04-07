'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, GitCommit } from 'lucide-react';

interface Job {
  id: string;
  jobType: string;
  status: string;
  label: string | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function JobIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle className="w-3.5 h-3.5 text-accent-green shrink-0" />;
    case 'failed': return <XCircle className="w-3.5 h-3.5 text-accent-red shrink-0" />;
    case 'running': return <RefreshCw className="w-3.5 h-3.5 text-accent-blue animate-spin shrink-0" />;
    case 'interrupted': return <XCircle className="w-3.5 h-3.5 text-accent-yellow shrink-0" />;
    default: return <Clock className="w-3.5 h-3.5 text-text-tertiary shrink-0" />;
  }
}

function jobLabel(job: Job): string {
  if (job.label) return job.label;
  if (job.jobType.startsWith('git_')) return `git ${job.jobType.slice(4)}`;
  return job.jobType.replace(/_/g, ' ');
}

interface Props { projectId: string }

export default function ActivityTimeline({ projectId }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const load = () =>
      fetch(`/api/v1/projects/${projectId}/jobs?limit=10`)
        .then(r => r.json())
        .then(d => setJobs(d.data ?? []))
        .catch(() => {});
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [projectId]);

  if (jobs.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs text-text-secondary mb-2">Activity</h3>
      <div className="border border-bg-4 rounded bg-bg-1 divide-y divide-bg-4">
        {jobs.slice(0, 8).map(job => (
          <div key={job.id} className="flex items-center gap-2 px-3 py-2">
            <JobIcon status={job.status} />
            <span className="flex-1 text-xs text-text-primary truncate">{jobLabel(job)}</span>
            <span className="text-xs text-text-tertiary shrink-0">{timeAgo(job.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
