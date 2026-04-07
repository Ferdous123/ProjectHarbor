'use client';
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { sanitizeHtml, ansiToHtml, getMimeTypePreference } from '@/lib/notebook-utils';
import type { CellOutput as CellOutputType, MimeBundle } from '@/types';

// F1: Training progress detection
const TRAINING_PATTERNS = [
  /epoch\s*(\d+)\s*\/?\s*(\d+)?.*?loss[:=\s]+([\d.]+)/i,
  /step\s*(\d+).*?loss[:=\s]+([\d.]+)/i,
];

interface TrainingMatch {
  epoch: number;
  totalEpochs: number | null;
  loss: number;
}

function detectTraining(text: string): TrainingMatch | null {
  for (const pat of TRAINING_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      return {
        epoch: parseInt(m[1], 10),
        totalEpochs: m[2] ? parseInt(m[2], 10) : null,
        loss: parseFloat(m[3] || m[2] || '0'),
      };
    }
  }
  return null;
}

function TrainingProgress({ text }: { text: string }) {
  const match = useMemo(() => detectTraining(text), [text]);
  if (!match) return null;

  const pct = match.totalEpochs ? Math.round((match.epoch / match.totalEpochs) * 100) : null;

  return (
    <div className="flex items-center gap-2 my-1 px-1">
      <span className="text-xs text-text-tertiary font-mono">
        Epoch {match.epoch}{match.totalEpochs ? `/${match.totalEpochs}` : ''}
      </span>
      {pct !== null && (
        <div className="flex-1 bg-bg-4 rounded-full h-1.5 max-w-32">
          <div
            className="bg-accent-blue h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <span className="text-xs text-text-tertiary">loss: {match.loss.toFixed(4)}</span>
    </div>
  );
}

function MimeOutput({ data }: { data: MimeBundle }) {
  const mimeKey = getMimeTypePreference(data);
  if (!mimeKey) return null;

  switch (mimeKey) {
    case 'text/html':
      return (
        <div
          className="notebook-html-output overflow-x-auto text-sm"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(data['text/html']!) }}
        />
      );
    case 'image/png':
      return <img src={`data:image/png;base64,${data['image/png']}`} alt="output" className="max-w-full" />;
    case 'image/svg+xml':
      return (
        <div
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(data['image/svg+xml']!) }}
          className="overflow-x-auto"
        />
      );
    case 'image/jpeg':
      return <img src={`data:image/jpeg;base64,${data['image/jpeg']}`} alt="output" className="max-w-full" />;
    case 'application/json':
      return <pre className="text-xs text-text-secondary overflow-x-auto">{JSON.stringify(data['application/json'], null, 2)}</pre>;
    case 'text/plain':
      return <pre className="text-xs text-text-secondary whitespace-pre-wrap">{data['text/plain']}</pre>;
    default:
      return null;
  }
}

function ErrorOutput({ ename, evalue, traceback }: { ename: string; evalue: string; traceback: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const preview = traceback.slice(-3);
  const hasMore = traceback.length > 3;

  return (
    <div className="border-l-2 border-accent-red pl-3 py-1">
      <div className="text-accent-red text-xs font-mono mb-1">
        <span className="font-bold">{ename}</span>: {evalue}
      </div>
      <div className="text-xs font-mono text-text-secondary">
        {(expanded ? traceback : preview).map((line, i) => (
          <div
            key={i}
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }}
          />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-text-tertiary hover:text-text-secondary mt-1 flex items-center gap-1"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {expanded ? 'Collapse' : `Show all ${traceback.length} lines`}
        </button>
      )}
    </div>
  );
}

// F12: Truncate long text outputs (>100 lines)
const MAX_VISIBLE_LINES = 100;

function TruncatableText({ text, className }: { text: string; className: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split('\n');
  if (lines.length <= MAX_VISIBLE_LINES) {
    return (
      <pre
        className={className}
        dangerouslySetInnerHTML={{ __html: ansiToHtml(text) }}
      />
    );
  }
  const visible = expanded ? text : lines.slice(0, MAX_VISIBLE_LINES).join('\n');
  return (
    <div>
      <pre
        className={className}
        dangerouslySetInnerHTML={{ __html: ansiToHtml(visible) }}
      />
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1 mt-1"
      >
        {expanded
          ? <><ChevronDown className="w-3 h-3" /> Collapse</>
          : <><ChevronRight className="w-3 h-3" /> Output truncated ({lines.length.toLocaleString()} lines). Show all</>}
      </button>
    </div>
  );
}

interface Props {
  outputs: CellOutputType[];
  collapsed: boolean;
}

export default function CellOutput({ outputs, collapsed }: Props) {
  if (outputs.length === 0 || collapsed) return null;

  // Merge consecutive stdout streams
  const merged: CellOutputType[] = [];
  for (const output of outputs) {
    const last = merged[merged.length - 1];
    if (
      output.output_type === 'stream' &&
      last?.output_type === 'stream' &&
      output.name === last.name
    ) {
      merged[merged.length - 1] = { ...last, text: last.text + output.text };
    } else {
      merged.push(output);
    }
  }

  return (
    <div className="px-2 py-1 space-y-1 bg-bg-3 border-t border-bg-4">
      {merged.map((output, i) => {
        switch (output.output_type) {
          case 'stream': {
            const cls = `text-xs font-mono whitespace-pre-wrap leading-relaxed ${
              output.name === 'stderr' ? 'bg-red-950/30 text-accent-red px-2 py-1 rounded' : 'text-text-primary'
            }`;
            return (
              <div key={i}>
                <TrainingProgress text={output.text} />
                <TruncatableText text={output.text} className={cls} />
              </div>
            );
          }
          case 'execute_result':
          case 'display_data':
            return <div key={i}><MimeOutput data={output.data} /></div>;
          case 'error':
            return <ErrorOutput key={i} ename={output.ename} evalue={output.evalue} traceback={output.traceback} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
