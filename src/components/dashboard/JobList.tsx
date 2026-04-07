'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Loader } from 'lucide-react';

interface Job { id: string; jobType: string; status: string; label: string | null; createdAt: string; durationMs: number | null }

interface Props { projectId: string }

const statusIcon = {
  success: <CheckCircle className="w-3.5 h-3.5 text-accent-green" />,
  failed:  <XCircle className="w-3.5 h-3.5 text-accent-red" />,
  running: <Loader className="w-3.5 h-3.5 text-accent-blue animate-spin" />,
  pending: <Clock className="w-3.5 h-3.5 text-text-tertiary" />,
};

export default function JobList({ projectId }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetch(`/api/v1/projects/${projectId}/jobs?limit=10`)
      .then((r) => r.json())
      .then((d) => setJobs(d.data ?? []));
    const interval = setInterval(() => {
      fetch(`/api/v1/projects/${projectId}/jobs?limit=10`)
        .then((r) => r.json())
        .then((d) => setJobs(d.data ?? []));
    }, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  return (
    <div className="bg-bg-2 border border-bg-4 rounded p-3">
      <h3 className="text-xs text-text-secondary mb-2">Recent Jobs</h3>
      {jobs.length === 0 ? (
        <p className="text-text-tertiary text-xs">No jobs yet</p>
      ) : (
        <div className="space-y-1">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center gap-2 text-xs">
              {statusIcon[job.status as keyof typeof statusIcon] ?? <Clock className="w-3.5 h-3.5 text-text-tertiary" />}
              <span className="flex-1 text-text-secondary truncate">{job.label ?? job.jobType}</span>
              {job.durationMs && <span className="text-text-tertiary shrink-0">{(job.durationMs / 1000).toFixed(1)}s</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
