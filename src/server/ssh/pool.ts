/**
 * Optional SSH pool — for future multi-machine support.
 * Primary path is local filesystem. This is not used in default local mode.
 */
import { Client } from 'ssh2';
import type { ConnectConfig } from 'ssh2';
import fs from 'fs';

interface PoolEntry {
  client: Client;
  projectId: string;
  connectedAt: Date;
}

const pool = new Map<string, PoolEntry>();

export async function getOrConnect(
  projectId: string,
  config: ConnectConfig
): Promise<Client> {
  const existing = pool.get(projectId);
  if (existing) return existing.client;

  return new Promise((resolve, reject) => {
    const client = new Client();

    client.on('ready', () => {
      pool.set(projectId, { client, projectId, connectedAt: new Date() });
      resolve(client);
    });

    client.on('error', (err) => {
      pool.delete(projectId);
      reject(err);
    });

    client.on('close', () => {
      pool.delete(projectId);
    });

    // Load private key if path provided
    const connectConfig: ConnectConfig = { ...config };
    if (typeof connectConfig.privateKey === 'string' && fs.existsSync(connectConfig.privateKey)) {
      connectConfig.privateKey = fs.readFileSync(connectConfig.privateKey);
    }

    client.connect({
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      ...connectConfig,
    });
  });
}

export function disconnect(projectId: string): void {
  const entry = pool.get(projectId);
  if (entry) {
    entry.client.end();
    pool.delete(projectId);
  }
}

export const sshPool = {
  getOrConnect,
  disconnect,
  closeAll: async (): Promise<void> => {
    for (const [id, entry] of pool.entries()) {
      entry.client.end();
      pool.delete(id);
    }
  },
  size: () => pool.size,
};
