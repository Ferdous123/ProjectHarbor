'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Search, X, Loader, Image as ImageIcon, Table2, FileText, FolderOpen } from 'lucide-react';
import FileTree from '@/components/files/FileTree';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const CodeMirror = dynamic(() => import('@uiw/react-codemirror'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'empty' | 'loading' | 'text' | 'csv' | 'image' | 'gallery' | 'search';

interface SearchResult { path: string; line: number; content: string; }
interface GalleryItem { name: string; path: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);
const CSV_EXTS = new Set(['csv', 'tsv']);

function extOf(p: string): string {
  return p.split('.').pop()?.toLowerCase() ?? '';
}

function isImage(p: string) { return IMAGE_EXTS.has(extOf(p)); }
function isCsv(p: string) { return CSV_EXTS.has(extOf(p)); }

function parseCsv(raw: string, isTsv: boolean): string[][] {
  const delim = isTsv ? '\t' : ',';
  const rows: string[][] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (rows.length >= 101) break;
    const cells: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delim && !inQ) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function CsvPreview({ content, path }: { content: string; path: string }) {
  const isTsv = path.endsWith('.tsv');
  const rows = parseCsv(content, isTsv);
  if (rows.length === 0) return <div className="p-4 text-xs text-text-tertiary">Empty file</div>;
  const headers = rows[0];
  const data = rows.slice(1);
  const totalLines = content.split('\n').filter(l => l.trim()).length;
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-bg-4 bg-bg-1 text-xs text-text-tertiary flex items-center gap-3 shrink-0">
        <Table2 className="w-3.5 h-3.5" />
        <span>{headers.length} columns</span>
        <span>·</span>
        <span>{totalLines - 1} rows (showing up to 100)</span>
        <span>·</span>
        <span className="font-mono">{path}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="text-xs border-collapse w-max min-w-full">
          <thead className="sticky top-0 bg-bg-2 z-10">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-1.5 text-left font-medium text-text-primary border-b border-bg-4 border-r border-bg-4 whitespace-nowrap max-w-48 truncate">
                  {h || <span className="text-text-tertiary italic">col {i + 1}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-bg-0' : 'bg-bg-1'}>
                {headers.map((_, ci) => (
                  <td key={ci} className="px-3 py-1 text-text-secondary border-r border-bg-4 whitespace-nowrap max-w-64 truncate" title={row[ci] ?? ''}>
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImageViewer({ src, path }: { src: string; path: string }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-bg-4 bg-bg-1 text-xs text-text-secondary font-mono shrink-0">{path}</div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-bg-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={path} className="max-w-full max-h-full object-contain" />
      </div>
    </div>
  );
}

function ImageGallery({
  items, dirPath, projectId, onSelectImage,
}: {
  items: GalleryItem[];
  dirPath: string;
  projectId: string;
  onSelectImage: (path: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-2 border-b border-bg-4 bg-bg-1 text-xs text-text-secondary shrink-0">
          <span className="flex items-center gap-2"><FolderOpen className="w-3.5 h-3.5" />{dirPath || 'Root'}</span>
        </div>
        <div className="flex items-center justify-center h-full text-text-tertiary text-sm">No images in this folder</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-bg-4 bg-bg-1 text-xs text-text-tertiary flex items-center gap-3 shrink-0">
        <ImageIcon className="w-3.5 h-3.5" />
        <span>{items.length} image{items.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span className="font-mono">{dirPath || 'Root'}</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {items.map((item) => {
            const src = `/api/v1/projects/${projectId}/files?action=raw&path=${encodeURIComponent(item.path)}`;
            return (
              <button
                key={item.path}
                onClick={() => onSelectImage(item.path)}
                className="group flex flex-col items-center gap-1.5 p-2 rounded border border-bg-4 hover:border-accent-blue/50 hover:bg-bg-2 transition-colors text-left"
              >
                <div className="w-full h-28 flex items-center justify-center overflow-hidden rounded bg-bg-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={item.name}
                    loading="lazy"
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <span className="text-xs text-text-secondary truncate w-full text-center group-hover:text-text-primary">{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SearchView({
  results, loading, query, onNavigate,
}: {
  results: SearchResult[];
  loading: boolean;
  query: string;
  onNavigate: (path: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-text-tertiary text-sm">
        <Loader className="w-4 h-4 animate-spin" /> Searching…
      </div>
    );
  }
  if (!query) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        Enter a search query above
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        No results for <span className="font-mono ml-1 text-text-secondary">"{query}"</span>
      </div>
    );
  }

  // Group by file path
  const byFile = new Map<string, SearchResult[]>();
  for (const r of results) {
    if (!byFile.has(r.path)) byFile.set(r.path, []);
    byFile.get(r.path)!.push(r);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-bg-4 bg-bg-1 text-xs text-text-tertiary shrink-0">
        {results.length}{results.length === 500 ? '+' : ''} match{results.length !== 1 ? 'es' : ''} in {byFile.size} file{byFile.size !== 1 ? 's' : ''} for <span className="font-mono text-text-secondary">"{query}"</span>
      </div>
      <div className="flex-1 overflow-auto">
        {Array.from(byFile.entries()).map(([filePath, matches]) => (
          <div key={filePath}>
            <button
              onClick={() => onNavigate(filePath)}
              className="w-full flex items-center gap-2 px-4 py-1.5 bg-bg-2 border-b border-bg-4 text-xs text-accent-blue hover:bg-bg-3 text-left sticky top-0 z-10"
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="font-mono truncate">{filePath}</span>
              <span className="ml-auto text-text-tertiary shrink-0">{matches.length}</span>
            </button>
            {matches.map((m) => (
              <button
                key={`${m.path}:${m.line}`}
                onClick={() => onNavigate(m.path)}
                className="w-full flex items-start gap-3 px-4 py-1 border-b border-bg-4/50 hover:bg-bg-2 text-left"
              >
                <span className="text-xs text-text-tertiary font-mono shrink-0 w-10 text-right pt-0.5">{m.line}</span>
                <span className="text-xs text-text-secondary font-mono truncate">{m.content}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  const [viewMode, setViewMode] = useState<ViewMode>('empty');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryDir, setGalleryDir] = useState<string>('');
  const [imageSrc, setImageSrc] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchExt, setSearchExt] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeQuery, setActiveQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSelectFile = useCallback(async (filePath: string) => {
    if (filePath.endsWith('.ipynb')) {
      router.push(`/projects/${projectId}/notebook?path=${encodeURIComponent(filePath)}`);
      return;
    }
    setSelectedPath(filePath);

    if (isImage(filePath)) {
      setImageSrc(`/api/v1/projects/${projectId}/files?action=raw&path=${encodeURIComponent(filePath)}`);
      setViewMode('image');
      return;
    }

    setViewMode('loading');
    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/files?action=read&path=${encodeURIComponent(filePath)}`);
      const data = await resp.json();
      const text: string = data.data?.content ?? '';
      setContent(text);
      setViewMode(isCsv(filePath) ? 'csv' : 'text');
    } catch {
      setContent('Failed to load file');
      setViewMode('text');
    }
  }, [projectId, router]);

  const handleSelectDir = useCallback(async (dirPath: string) => {
    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/files?action=list&path=${encodeURIComponent(dirPath)}`);
      const data = await resp.json();
      const entries: Array<{ name: string; path: string; type: string }> = data.data ?? [];
      const images: GalleryItem[] = entries
        .filter(e => e.type === 'file' && isImage(e.name))
        .map(e => ({ name: e.name, path: e.path }));
      if (images.length > 0) {
        setGalleryItems(images);
        setGalleryDir(dirPath);
        setSelectedPath(dirPath);
        setViewMode('gallery');
      }
    } catch { /* ignore */ }
  }, [projectId]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setActiveQuery(q);
    setSearchResults([]);
    setSearchLoading(true);
    setViewMode('search');
    setSelectedPath(null);
    try {
      const params = new URLSearchParams({ action: 'search', q });
      if (searchExt.trim()) params.set('ext', searchExt.trim().replace(/^\./, ''));
      const resp = await fetch(`/api/v1/projects/${projectId}/files?${params}`);
      const data = await resp.json();
      setSearchResults(data.data ?? []);
    } catch { /* ignore */ } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchExt, projectId]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchExt('');
    setActiveQuery('');
    setSearchResults([]);
    setViewMode('empty');
    setSelectedPath(null);
    searchInputRef.current?.focus();
  }, []);

  const handleSearchNavigate = useCallback((filePath: string) => {
    handleSelectFile(filePath);
  }, [handleSelectFile]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const renderMainPanel = () => {
    switch (viewMode) {
      case 'empty':
        return (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary text-sm gap-2">
            <FileText className="w-8 h-8 opacity-30" />
            <p>Select a file to view</p>
            <p className="text-xs">Or use the search bar to find content across files</p>
          </div>
        );
      case 'loading':
        return <div className="flex items-center justify-center h-full text-text-tertiary text-sm gap-2"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>;
      case 'image':
        return <ImageViewer src={imageSrc} path={selectedPath ?? ''} />;
      case 'csv':
        return <CsvPreview content={content} path={selectedPath ?? ''} />;
      case 'gallery':
        return (
          <ImageGallery
            items={galleryItems}
            dirPath={galleryDir}
            projectId={projectId}
            onSelectImage={handleSelectFile}
          />
        );
      case 'search':
        return (
          <SearchView
            results={searchResults}
            loading={searchLoading}
            query={activeQuery}
            onNavigate={handleSearchNavigate}
          />
        );
      case 'text':
      default:
        return (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 border-b border-bg-4 bg-bg-1 text-xs text-text-secondary font-mono shrink-0">{selectedPath}</div>
            <div className="flex-1 overflow-auto">
              <CodeMirror value={content} readOnly height="calc(100vh - 120px)" className="text-sm" />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-bg-4 bg-bg-1 overflow-hidden flex flex-col">
        {/* L3: Search bar */}
        <div className="px-2 py-2 border-b border-bg-4 space-y-1.5 shrink-0">
          <div className="flex gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary pointer-events-none" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="Search files…"
                className="h-7 pl-6 text-xs bg-bg-2 border-bg-4 focus:border-accent-blue"
              />
            </div>
            {(searchQuery || viewMode === 'search') && (
              <Button variant="ghost" size="sm" onClick={clearSearch} className="h-7 w-7 p-0 shrink-0">
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
          <div className="flex gap-1">
            <Input
              value={searchExt}
              onChange={e => setSearchExt(e.target.value)}
              placeholder="ext (py, csv…)"
              className="h-6 text-xs bg-bg-2 border-bg-4 focus:border-accent-blue"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSearch}
              disabled={!searchQuery.trim()}
              className="h-6 px-2 text-xs shrink-0"
            >
              Go
            </Button>
          </div>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-hidden">
          <FileTree
            projectId={projectId}
            onSelectFile={handleSelectFile}
            onSelectDir={handleSelectDir}
            selectedPath={selectedPath ?? undefined}
          />
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 min-w-0 overflow-hidden bg-bg-0">
        {renderMainPanel()}
      </div>
    </div>
  );
}
