'use client';
import { useState, useEffect } from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Loader } from 'lucide-react';
import type { FileEntry } from '@/types';

interface Props {
  projectId: string;
  onSelectFile: (path: string) => void;
  selectedPath?: string;
}

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  loaded?: boolean;
  open?: boolean;
}

async function loadDir(projectId: string, path: string): Promise<TreeNode[]> {
  const resp = await fetch(`/api/v1/projects/${projectId}/files?action=list&path=${encodeURIComponent(path)}`);
  const data = await resp.json();
  return (data.data ?? []).sort((a: FileEntry, b: FileEntry) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
}

function TreeEntry({
  node, depth, projectId, onSelectFile, selectedPath, onToggle,
}: {
  node: TreeNode; depth: number; projectId: string;
  onSelectFile: (path: string) => void; selectedPath?: string;
  onToggle: (node: TreeNode) => void;
}) {
  const isDir = node.type === 'directory';
  const isSelected = node.path === selectedPath;

  return (
    <>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-bg-3 text-xs transition-colors ${isSelected ? 'bg-bg-3 text-accent-blue' : 'text-text-secondary'}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => isDir ? onToggle(node) : onSelectFile(node.path)}
      >
        {isDir ? (
          <>
            {node.open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            {node.open ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-accent-yellow" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-accent-yellow" />}
          </>
        ) : (
          <>
            <span className="w-3 h-3 shrink-0" />
            <FileText className="w-3.5 h-3.5 shrink-0" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {isDir && node.open && node.children && node.children.map((child) => (
        <TreeEntry
          key={child.path}
          node={child}
          depth={depth + 1}
          projectId={projectId}
          onSelectFile={onSelectFile}
          selectedPath={selectedPath}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

export default function FileTree({ projectId, onSelectFile, selectedPath }: Props) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDir(projectId, '').then((entries) => {
      setNodes(entries);
      setLoading(false);
    });
  }, [projectId]);

  const handleToggle = async (node: TreeNode) => {
    if (!node.loaded) {
      const children = await loadDir(projectId, node.path);
      setNodes((prev) => updateNode(prev, node.path, { ...node, children, loaded: true, open: true }));
    } else {
      setNodes((prev) => updateNode(prev, node.path, { ...node, open: !node.open }));
    }
  };

  if (loading) return <div className="flex items-center justify-center p-4"><Loader className="w-4 h-4 animate-spin text-text-tertiary" /></div>;

  return (
    <div className="overflow-y-auto h-full py-1">
      {nodes.map((node) => (
        <TreeEntry
          key={node.path}
          node={node}
          depth={0}
          projectId={projectId}
          onSelectFile={onSelectFile}
          selectedPath={selectedPath}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

function updateNode(nodes: TreeNode[], path: string, updated: TreeNode): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === path) return updated;
    if (n.children) return { ...n, children: updateNode(n.children, path, updated) };
    return n;
  });
}
