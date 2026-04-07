import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw Object.assign(new Error('GITHUB_TOKEN not set in .env'), { status: 501 });
  return token;
}

function getUsername(): string {
  const username = process.env.GITHUB_USERNAME;
  if (!username) throw Object.assign(new Error('GITHUB_USERNAME not set in .env'), { status: 501 });
  return username;
}

async function gh(endpoint: string, opts: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(`https://api.github.com${endpoint}`, {
    ...opts,
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ProjectHarbor',
      Accept: 'application/vnd.github.v3+json',
      ...(opts.headers as Record<string, string> || {}),
    },
  });
}

// ── Repo CRUD ──────────────────────────────────────────────────────

export async function listRepos(page = 1, perPage = 30) {
  const res = await gh(`/user/repos?per_page=${perPage}&page=${page}&sort=updated`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed to list repos'); }
  return res.json();
}

export async function getRepo(owner: string, repo: string) {
  const res = await gh(`/repos/${owner}/${repo}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Repo not found'); }
  return res.json();
}

export async function createRepo(name: string, description: string, isPrivate: boolean) {
  const res = await gh('/user/repos', {
    method: 'POST',
    body: JSON.stringify({ name, description, private: isPrivate, auto_init: false }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed to create repo'); }
  return res.json();
}

export async function deleteRepo(owner: string, repo: string) {
  const res = await gh(`/repos/${owner}/${repo}`, { method: 'DELETE' });
  if (res.status === 204) return { deleted: true };
  if (res.status === 403) throw new Error('Token lacks delete permission (needs admin)');
  throw new Error('Delete failed');
}

export async function updateRepo(owner: string, repo: string, updates: {
  description?: string; private?: boolean; name?: string;
}) {
  const res = await gh(`/repos/${owner}/${repo}`, {
    method: 'PATCH', body: JSON.stringify(updates),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
  return res.json();
}

export async function clearRepo(owner: string, repo: string) {
  const repo_data = await getRepo(owner, repo);
  const description = repo_data.description || '';
  const isPrivate = repo_data.private;
  await deleteRepo(owner, repo);
  await new Promise(r => setTimeout(r, 3000));
  return createRepo(repo, description, isPrivate);
}

// ── Repo contents ──────────────────────────────────────────────────

export async function getRepoContents(owner: string, repo: string, filePath = '', ref = 'main') {
  const res = await gh(`/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed to get contents'); }
  return res.json();
}

export async function getFileContent(owner: string, repo: string, filePath: string, ref = 'main') {
  const res = await gh(`/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
  const data = await res.json();
  if (data.content) {
    return { ...data, decoded: Buffer.from(data.content, 'base64').toString('utf-8') };
  }
  return data;
}

export async function uploadFile(owner: string, repo: string, filePath: string,
  content: string, message: string, sha?: string) {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString('base64'),
  };
  if (sha) body.sha = sha;
  const res = await gh(`/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT', body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
  return res.json();
}

export async function deleteFile(owner: string, repo: string, filePath: string, sha: string, message: string) {
  const res = await gh(`/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'DELETE', body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
  return res.json();
}

// ── Branches & commits ────────────────────────────────────────────

export async function listBranches(owner: string, repo: string) {
  const res = await gh(`/repos/${owner}/${repo}/branches`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
  return res.json();
}

export async function listCommits(owner: string, repo: string, page = 1, perPage = 20) {
  const res = await gh(`/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
  return res.json();
}

// ── Local git init & push ─────────────────────────────────────────

export async function initAndPush(projectDir: string, remoteUrl: string, branch = 'main') {
  const git = (args: string[]) =>
    execFileAsync('git', args, { cwd: projectDir, windowsHide: true });

  await git(['init']);
  await git(['checkout', '-b', branch]);

  const gitignorePath = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath,
      '__pycache__/\n*.pyc\n.ipynb_checkpoints/\n*.harbor-backup\ndata/\noutputs/\n');
  }

  await git(['add', '-A']);
  await git(['commit', '-m', 'Initial commit from ProjectHarbor']);
  await git(['remote', 'add', 'origin', remoteUrl]);
  await git(['push', '-u', 'origin', branch]);
}

// ── Full create + push workflow ───────────────────────────────────

export async function createAndInitRepo(opts: {
  name: string;
  description: string;
  isPrivate: boolean;
  projectDir: string;
}) {
  const repo = await createRepo(opts.name, opts.description, opts.isPrivate);
  await initAndPush(opts.projectDir, repo.ssh_url);
  return {
    cloneUrl: repo.ssh_url,
    httpsUrl: repo.clone_url,
    htmlUrl: repo.html_url,
    fullName: repo.full_name,
    owner: repo.owner.login,
    repo: repo.name,
  };
}

export { getToken, getUsername };
