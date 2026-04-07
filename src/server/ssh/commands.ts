/**
 * SSH command allowlist — typed, safe command builders.
 * Used only in optional multi-machine SSH mode.
 */

type CommandBuilder = (params: Record<string, string>) => string[];

const ALLOWLIST: Record<string, CommandBuilder> = {
  GIT_STATUS:  ({ dir }) => ['git', '-C', dir, 'status', '--porcelain', '-b'],
  GIT_PULL:    ({ dir }) => ['git', '-C', dir, 'pull', '--ff-only'],
  GIT_PUSH:    ({ dir }) => ['git', '-C', dir, 'push'],
  GIT_LOG:     ({ dir, n = '20' }) => ['git', '-C', dir, 'log', `--max-count=${n}`, '--oneline', '--no-color'],
  GIT_DIFF:    ({ dir, file }) => ['git', '-C', dir, 'diff', '--', file],
  GIT_COMMIT:  ({ dir, message }) => ['git', '-C', dir, 'commit', '-m', message],
  GIT_ADD_ALL: ({ dir }) => ['git', '-C', dir, 'add', '-A'],
  GIT_BRANCH:  ({ dir }) => ['git', '-C', dir, 'branch', '-a', '--no-color'],

  JUPYTER_STATUS: () => ['python', '-c', "import subprocess,sys; r=subprocess.run(['jupyter','notebook','list'],capture_output=True,text=True); print(r.stdout)"],
  PY_ENV_LIST:    () => ['conda', 'env', 'list', '--json'],
  PIP_LIST:       ({ envPython }) => [envPython, '-m', 'pip', 'list', '--format=json'],
  PIP_INSTALL:    ({ envPython, pkg }) => [envPython, '-m', 'pip', 'install', pkg],
  PIP_UNINSTALL:  ({ envPython, pkg }) => [envPython, '-m', 'pip', 'uninstall', '-y', pkg],

  LS:       ({ dir }) => ['ls', '-la', dir],
  MKDIR:    ({ dir }) => ['mkdir', '-p', dir],
  HOSTNAME: () => ['hostname'],
  WHOAMI:   () => ['whoami'],
};

export function buildCommand(key: string, params: Record<string, string> = {}): string[] {
  const builder = ALLOWLIST[key];
  if (!builder) {
    throw new Error(`Unknown command key: ${key}`);
  }
  return builder(params);
}

export function isAllowedKey(key: string): boolean {
  return key in ALLOWLIST;
}
