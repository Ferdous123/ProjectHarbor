import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

export const environmentService = {
  async listEnvs(searchPaths: string[] = []): Promise<Array<{ name: string; path: string; pythonVersion: string; active: boolean }>> {
    const results: Array<{ name: string; path: string; pythonVersion: string; active: boolean }> = [];

    for (const basePath of searchPaths) {
      try {
        const entries = await fs.promises.readdir(basePath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const envPath = path.join(basePath, entry.name);
          const pythonPath = path.join(envPath, 'Scripts', 'python.exe');
          const pythonPathUnix = path.join(envPath, 'bin', 'python');

          const pyExe = fs.existsSync(pythonPath) ? pythonPath : fs.existsSync(pythonPathUnix) ? pythonPathUnix : null;
          if (!pyExe) continue;

          try {
            const { stdout } = await execFileAsync(pyExe, ['--version'], { windowsHide: true });
            const version = stdout.trim().replace('Python ', '');
            results.push({ name: entry.name, path: envPath, pythonVersion: version, active: false });
          } catch { /* not a valid Python env */ }
        }
      } catch { /* directory doesn't exist */ }
    }

    return results;
  },

  async listPackages(envPath: string): Promise<Array<{ name: string; version: string; latestVersion: string | null }>> {
    const pyExe = path.join(envPath, 'Scripts', 'python.exe');
    const pyExeUnix = path.join(envPath, 'bin', 'python');
    const python = fs.existsSync(pyExe) ? pyExe : pyExeUnix;

    const { stdout } = await execFileAsync(python, ['-m', 'pip', 'list', '--format=json'], { windowsHide: true });
    const packages = JSON.parse(stdout);
    return packages.map((p: any) => ({ name: p.name, version: p.version, latestVersion: null }));
  },

  async installPackage(envPath: string, packageName: string): Promise<string> {
    const pyExe = path.join(envPath, 'Scripts', 'python.exe');
    const pyExeUnix = path.join(envPath, 'bin', 'python');
    const python = fs.existsSync(pyExe) ? pyExe : pyExeUnix;

    const { stdout, stderr } = await execFileAsync(
      python, ['-m', 'pip', 'install', packageName, '--no-input'],
      { windowsHide: true, timeout: 120000 }
    );
    return stdout + stderr;
  },

  async uninstallPackage(envPath: string, packageName: string): Promise<string> {
    const pyExe = path.join(envPath, 'Scripts', 'python.exe');
    const pyExeUnix = path.join(envPath, 'bin', 'python');
    const python = fs.existsSync(pyExe) ? pyExe : pyExeUnix;

    const { stdout, stderr } = await execFileAsync(
      python, ['-m', 'pip', 'uninstall', '-y', packageName],
      { windowsHide: true, timeout: 60000 }
    );
    return stdout + stderr;
  },

  async getPythonVersion(envPath: string): Promise<string> {
    const pyExe = path.join(envPath, 'Scripts', 'python.exe');
    const pyExeUnix = path.join(envPath, 'bin', 'python');
    const python = fs.existsSync(pyExe) ? pyExe : pyExeUnix;

    const { stdout } = await execFileAsync(python, ['--version'], { windowsHide: true });
    return stdout.trim();
  },
};
