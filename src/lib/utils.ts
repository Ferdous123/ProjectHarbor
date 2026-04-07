import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitize a name for use as a Windows file/folder name.
 * Removes forbidden characters, replaces spaces, handles reserved names.
 */
export function sanitizeWindowsName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')        // forbidden chars
    .replace(/\s+/g, '_')                  // spaces to underscores
    .replace(/\.+$/g, '')                  // no trailing dots
    .replace(/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i, '_$1')  // reserved names
    .slice(0, 200);                        // max path component length
}

/**
 * Sanitize a name for use as a GitHub repo name (lowercase, hyphens).
 */
export function sanitizeGitHubRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}
