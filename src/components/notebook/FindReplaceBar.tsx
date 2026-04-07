'use client';
import { useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  query: string;
  replaceQuery: string;
  resultCount: number;
  currentIndex: number;
  showReplace: boolean;
  onQueryChange: (q: string) => void;
  onReplaceQueryChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

export default function FindReplaceBar({
  query, replaceQuery, resultCount, currentIndex, showReplace,
  onQueryChange, onReplaceQueryChange, onNext, onPrev,
  onReplace, onReplaceAll, onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter') {
      e.shiftKey ? onPrev() : onNext();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-1 border-b border-bg-4 shrink-0">
      <div className="flex flex-col gap-1 flex-1">
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find in notebook..."
            className="h-6 text-xs bg-bg-2 border-bg-4 w-56"
          />
          <span className="text-xs text-text-tertiary shrink-0 w-16">
            {query ? `${resultCount === 0 ? 'No' : `${currentIndex + 1}/${resultCount}`} match${resultCount !== 1 ? 'es' : ''}` : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={onPrev} disabled={resultCount === 0} className="h-6 w-6 p-0" title="Previous (Shift+Enter)">
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onNext} disabled={resultCount === 0} className="h-6 w-6 p-0" title="Next (Enter)">
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>

        {showReplace && (
          <div className="flex items-center gap-1">
            <Input
              value={replaceQuery}
              onChange={(e) => onReplaceQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Replace with..."
              className="h-6 text-xs bg-bg-2 border-bg-4 w-56"
            />
            <Button variant="ghost" size="sm" onClick={onReplace} disabled={resultCount === 0} className="h-6 px-2 text-xs">Replace</Button>
            <Button variant="ghost" size="sm" onClick={onReplaceAll} disabled={resultCount === 0} className="h-6 px-2 text-xs">All</Button>
          </div>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0 shrink-0">
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
