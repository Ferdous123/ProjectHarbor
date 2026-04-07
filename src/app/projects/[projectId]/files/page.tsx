'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import FileTree from '@/components/files/FileTree';

const CodeMirror = dynamic(() => import('@uiw/react-codemirror'), { ssr: false });

export default function FilesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSelectFile = async (path: string) => {
    if (path.endsWith('.ipynb')) {
      router.push(`/projects/${projectId}/notebook?path=${encodeURIComponent(path)}`);
      return;
    }
    setSelectedPath(path);
    setLoading(true);
    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/files?action=read&path=${encodeURIComponent(path)}`);
      const data = await resp.json();
      setContent(data.data?.content ?? '');
    } catch {
      setContent('Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* File tree */}
      <div className="w-64 shrink-0 border-r border-bg-4 bg-bg-1 overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-bg-4 text-xs text-text-secondary">Files</div>
        <FileTree projectId={projectId} onSelectFile={handleSelectFile} selectedPath={selectedPath ?? undefined} />
      </div>

      {/* File viewer */}
      <div className="flex-1 min-w-0 overflow-auto bg-bg-0">
        {!selectedPath ? (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            Select a file to view
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">Loading...</div>
        ) : (
          <div className="h-full">
            <div className="px-4 py-2 border-b border-bg-4 bg-bg-1 text-xs text-text-secondary font-mono">{selectedPath}</div>
            <CodeMirror value={content} readOnly height="calc(100vh - 120px)" className="text-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
