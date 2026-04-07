/**
 * Jupyter service — communicates with the PC agent REST API.
 * Agent manages Jupyter lifecycle. We never SSH for this.
 * All calls include X-API-Key header (E6).
 */
import { projectService } from './project.service';

interface AgentConfig {
  host: string;
  port: string;
  apiKey: string;
  jupyterPort: string;
  jupyterToken: string;
}

async function getAgentConfig(projectId: string): Promise<AgentConfig> {
  const settings = await projectService.getSettings(projectId);
  return {
    host:          settings['agent.host']      || '127.0.0.1',
    port:          settings['agent.port']      || '9111',
    apiKey:        settings['agent.apiKey']    || '',
    jupyterPort:   settings['jupyter.port']   || '8888',
    jupyterToken:  settings['jupyter.token']  || '',
  };
}

async function agentFetch(
  cfg: AgentConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `http://${cfg.host}:${cfg.port}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': cfg.apiKey,
      ...(options.headers as Record<string, string> ?? {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  return resp;
}

export const jupyterService = {
  async getStatus(projectId: string) {
    const cfg = await getAgentConfig(projectId);
    try {
      const resp = await agentFetch(cfg, '/jupyter/status');
      if (!resp.ok) throw new Error(`Agent returned ${resp.status}`);
      return await resp.json();
    } catch {
      return { running: false, pid: null, port: parseInt(cfg.jupyterPort), uptime_sec: null, watchdog_enabled: true, manual_stop: false, agent_unreachable: true };
    }
  },

  async start(projectId: string) {
    const cfg = await getAgentConfig(projectId);
    const resp = await agentFetch(cfg, '/jupyter/start', { method: 'POST' });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Agent error: ${body}`);
    }
    return resp.json();
  },

  async stop(projectId: string) {
    const cfg = await getAgentConfig(projectId);
    const resp = await agentFetch(cfg, '/jupyter/stop', { method: 'POST' });
    if (!resp.ok) throw new Error(`Agent error: ${resp.status}`);
    return resp.json();
  },

  async restart(projectId: string) {
    const cfg = await getAgentConfig(projectId);
    const resp = await agentFetch(cfg, '/jupyter/restart', { method: 'POST' });
    if (!resp.ok) throw new Error(`Agent error: ${resp.status}`);
    return resp.json();
  },

  async getEvents(projectId: string) {
    const cfg = await getAgentConfig(projectId);
    try {
      const resp = await agentFetch(cfg, '/jupyter/events');
      if (!resp.ok) return [];
      return resp.json();
    } catch {
      return [];
    }
  },

  async setWatchdog(projectId: string, action: 'enable' | 'disable' | 'resume') {
    const cfg = await getAgentConfig(projectId);
    const resp = await agentFetch(cfg, '/jupyter/watchdog', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    if (!resp.ok) throw new Error(`Agent error: ${resp.status}`);
    return resp.json();
  },

  async agentHealth(projectId: string) {
    const cfg = await getAgentConfig(projectId);
    try {
      const resp = await agentFetch(cfg, '/health');
      if (!resp.ok) return null;
      return resp.json();
    } catch {
      return null;
    }
  },

  async agentConfig(projectId: string) {
    const cfg = await getAgentConfig(projectId);
    const resp = await agentFetch(cfg, '/config');
    if (!resp.ok) throw new Error('Failed to get agent config');
    return resp.json();
  },

  async updateAgentConfig(projectId: string, updates: Record<string, any>) {
    const cfg = await getAgentConfig(projectId);
    const resp = await agentFetch(cfg, '/config', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!resp.ok) throw new Error('Failed to update agent config');
    return resp.json();
  },

  // Build the full Jupyter URL (for Colab-style link)
  getJupyterUrl(host: string, port: string, token: string, notebookPath?: string): string {
    const base = `http://${host}:${port}`;
    if (!notebookPath) return `${base}?token=${token}`;
    return `${base}/notebooks/${notebookPath}?token=${token}`;
  },
};
