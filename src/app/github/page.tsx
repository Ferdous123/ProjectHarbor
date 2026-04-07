'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Lock, Globe, Plus, Trash2, ExternalLink, RefreshCw,
  FolderOpen, FileText, ChevronLeft, AlertTriangle, X
} from 'lucide-react';

interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  ssh_url: string;
  clone_url: string;
  stargazers_count: number;
  updated_at: string;
  owner: { login: string };
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  download_url: string | null;
  sha: string;
}

type ModalType = 'create' | 'delete' | 'clear' | null;

export default function GitHubPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [confirmName, setConfirmName] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [browsing, setBrowsing] = useState<{ repo: Repo; path: string } | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', isPrivate: true });
  const [actionLoading, setActionLoading] = useState(false);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/github/repos');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load repos');
      setRepos(json.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRepos(); }, [loadRepos]);

  const browseRepo = async (repo: Repo, filePath = '') => {
    setFilesLoading(true);
    setBrowsing({ repo, path: filePath });
    try {
      const res = await fetch(`/api/v1/github/repos/${repo.owner.login}/${repo.name}/contents/${filePath}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load files');
      const entries: FileEntry[] = Array.isArray(json.data) ? json.data : [json.data];
      entries.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(entries);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFilesLoading(false);
    }
  };

  const createRepo = async () => {
    if (!createForm.name.trim()) { toast.error('Repo name required'); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Create failed');
      toast.success(`Created ${json.data.full_name}`);
      setModal(null);
      setCreateForm({ name: '', description: '', isPrivate: true });
      loadRepos();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const deleteRepo = async () => {
    if (!selectedRepo || confirmName !== selectedRepo.name) {
      toast.error('Name does not match'); return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast.success(`Deleted ${selectedRepo.full_name}`);
      setModal(null);
      setConfirmName('');
      loadRepos();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const clearRepo = async () => {
    if (!selectedRepo || confirmName !== selectedRepo.name) {
      toast.error('Name does not match'); return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Clear failed');
      toast.success(`Cleared ${selectedRepo.name} — all files and history deleted`);
      setModal(null);
      setConfirmName('');
      loadRepos();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = repos.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const timeAgo = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const h = ms / 3600000;
    if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
    if (h < 24) return `${Math.floor(h)}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  if (browsing) {
    const pathParts = browsing.path.split('/').filter(Boolean);
    return (
      <div className="min-h-screen bg-bg-0 text-text-primary p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setBrowsing(null)} className="text-text-secondary hover:text-text-primary">
              <ChevronLeft className="w-4 h-4 inline" /> Back
            </button>
            <span className="text-text-tertiary text-sm">/</span>
            <button
              onClick={() => browseRepo(browsing.repo, '')}
              className="text-accent-blue text-sm hover:underline"
            >
              {browsing.repo.name}
            </button>
            {pathParts.map((part, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="text-text-tertiary text-sm">/</span>
                <button
                  onClick={() => browseRepo(browsing.repo, pathParts.slice(0, i + 1).join('/'))}
                  className="text-accent-blue text-sm hover:underline"
                >{part}</button>
              </span>
            ))}
          </div>

          <div className="border border-bg-4 rounded bg-bg-1">
            {filesLoading ? (
              <div className="p-6 text-center text-text-secondary text-sm">Loading...</div>
            ) : files.length === 0 ? (
              <div className="p-6 text-center text-text-secondary text-sm">Empty directory</div>
            ) : (
              files.map(f => (
                <div key={f.path} className="flex items-center gap-3 px-4 py-2.5 border-b border-bg-4 last:border-0 hover:bg-bg-2">
                  {f.type === 'dir' ? (
                    <FolderOpen className="w-4 h-4 text-accent-yellow shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-text-tertiary shrink-0" />
                  )}
                  <button
                    className="flex-1 text-left text-sm text-text-primary hover:text-accent-blue"
                    onClick={() => f.type === 'dir' ? browseRepo(browsing.repo, f.path) : null}
                  >
                    {f.name}
                  </button>
                  {f.type === 'file' && (
                    <span className="text-text-tertiary text-xs">{(f.size / 1024).toFixed(1)} KB</span>
                  )}
                  {f.download_url && (
                    <a href={f.download_url} target="_blank" rel="noopener noreferrer"
                      className="text-text-tertiary hover:text-text-secondary">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-0 text-text-primary p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/projects" className="text-text-secondary hover:text-text-primary text-xs flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" /> Projects
              </Link>
            </div>
            <h1 className="text-lg font-semibold">GitHub</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadRepos} className="text-text-secondary hover:text-text-primary p-1.5 rounded hover:bg-bg-2">
              <RefreshCw className="w-4 h-4" />
            </button>
            <Button size="sm" onClick={() => setModal('create')} className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> New Repo
            </Button>
          </div>
        </div>

        {/* Search */}
        <input
          className="w-full bg-bg-1 border border-bg-4 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary mb-4 focus:outline-none focus:border-accent-blue"
          placeholder="Search repos..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Error / Loading */}
        {error && (
          <div className="border border-red-500/30 bg-red-500/10 rounded p-3 text-sm text-red-400 mb-4">
            {error === 'GITHUB_TOKEN not set in .env'
              ? 'Add GITHUB_TOKEN to .env to enable GitHub integration.'
              : error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-text-secondary text-sm py-12">Loading...</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(repo => (
              <div key={repo.id} className="border border-bg-4 rounded bg-bg-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {repo.private
                        ? <Lock className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                        : <Globe className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}
                      <span className="font-medium text-sm text-text-primary">{repo.name}</span>
                      <span className="text-text-tertiary text-xs">updated {timeAgo(repo.updated_at)}</span>
                    </div>
                    {repo.description && (
                      <p className="text-text-secondary text-xs truncate">{repo.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => browseRepo(repo)}>
                    <FolderOpen className="w-3.5 h-3.5 mr-1" /> Browse Files
                  </Button>
                  <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open GitHub
                    </Button>
                  </a>
                  <div className="flex-1" />
                  <Button
                    variant="outline" size="sm"
                    className="text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10"
                    onClick={() => { setSelectedRepo(repo); setModal('clear'); setConfirmName(''); }}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Clear
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                    onClick={() => { setSelectedRepo(repo); setModal('delete'); setConfirmName(''); }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && !loading && (
              <div className="text-center text-text-secondary text-sm py-12">
                {search ? 'No repos match your search.' : 'No repos found.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {modal === 'create' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-1 border border-bg-4 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Create New Repository</h2>
              <button onClick={() => setModal(null)}><X className="w-4 h-4 text-text-tertiary" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Repository name</label>
                <input
                  className="w-full bg-bg-0 border border-bg-4 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="my-project"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Description</label>
                <input
                  className="w-full bg-bg-0 border border-bg-4 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="private-check"
                  checked={createForm.isPrivate}
                  onChange={e => setCreateForm(f => ({ ...f, isPrivate: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="private-check" className="text-xs text-text-secondary">Private repository</label>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancel</Button>
              <Button size="sm" onClick={createRepo} disabled={actionLoading}>
                {actionLoading ? 'Creating...' : 'Create Repository'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && selectedRepo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-1 border border-bg-4 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-red-400">Delete Repository</h2>
              <button onClick={() => setModal(null)}><X className="w-4 h-4 text-text-tertiary" /></button>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              This will permanently delete <strong className="text-text-primary">{selectedRepo.full_name}</strong> and all its data. This cannot be undone.
            </p>
            <label className="text-xs text-text-secondary block mb-1">Type <code className="text-text-primary">{selectedRepo.name}</code> to confirm</label>
            <input
              className="w-full bg-bg-0 border border-bg-4 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-500 mb-4"
              value={confirmName}
              onChange={e => setConfirmName(e.target.value)}
              placeholder={selectedRepo.name}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={deleteRepo}
                disabled={actionLoading || confirmName !== selectedRepo.name}
              >
                {actionLoading ? 'Deleting...' : 'Delete Repository'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Modal */}
      {modal === 'clear' && selectedRepo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-1 border border-bg-4 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-yellow-500">Clear Repository</h2>
              <button onClick={() => setModal(null)}><X className="w-4 h-4 text-text-tertiary" /></button>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              This will delete <strong className="text-red-400">ALL files and history</strong> from <strong className="text-text-primary">{selectedRepo.name}</strong> by deleting and recreating the repo. Cannot be undone.
            </p>
            <label className="text-xs text-text-secondary block mb-1">Type <code className="text-text-primary">{selectedRepo.name}</code> to confirm</label>
            <input
              className="w-full bg-bg-0 border border-bg-4 rounded px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 mb-4"
              value={confirmName}
              onChange={e => setConfirmName(e.target.value)}
              placeholder={selectedRepo.name}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-yellow-500 hover:bg-yellow-600 text-black"
                onClick={clearRepo}
                disabled={actionLoading || confirmName !== selectedRepo.name}
              >
                {actionLoading ? 'Clearing...' : 'Clear Repository'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
