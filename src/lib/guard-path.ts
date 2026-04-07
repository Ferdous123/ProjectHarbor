import path from 'path';

/**
 * Prevent path traversal attacks.
 * Ensures the resolved path is within the allowed base directory.
 * Throws 403 if the path escapes the base.
 */
export function guardPath(basePath: string, userPath: string): string {
  const base = path.resolve(basePath);
  const resolved = path.resolve(basePath, userPath);

  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw Object.assign(new Error(`Access denied: path traversal detected`), {
      status: 403,
      code: 'PATH_TRAVERSAL',
    });
  }

  return resolved;
}
