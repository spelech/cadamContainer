import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Streamdown } from 'streamdown';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { Shimmer } from '@/components/ai-elements/shimmer';
import {
  Reasoning,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { CollapsibleContent } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSharedSpinnerVerb } from '@/hooks/useSharedSpinnerVerb';
import { cn } from '@/lib/utils';

// Mirrors `streamdownPlugins` from ai-elements/reasoning.tsx ReasoningContent
// so our custom-scrolling body keeps full markdown feature parity (code
// highlighting, math, mermaid, CJK) instead of regressing to bare Streamdown.
const streamdownPlugins = { cjk, code, math, mermaid };

interface ChatReasoningProps {
  text: string;
  isStreaming: boolean;
  className?: string;
}

/**
 * Split long markdown reasoning text into coherent blocks without
 * slicing code fences or math expressions in half.
 */
function splitReasoningBlocks(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let currentBlock: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
    currentBlock.push(line);
    // Break on blank lines when outside code blocks, or when current chunk exceeds 35 lines
    if (!inCodeBlock && (line.trim() === '' || currentBlock.length >= 35)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }
  return blocks.filter((b) => b.trim().length > 0);
}

/**
 * CADAM-tailored reasoning block with virtualization for long traces.
 */
export function ChatReasoning({
  text,
  isStreaming,
  className,
}: ChatReasoningProps) {
  const thinkingVerb = useSharedSpinnerVerb(isStreaming);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  useEffect(() => {
    if (isStreaming) setIsDetailsOpen(false);
  }, [isStreaming]);

  return (
    <Reasoning
      defaultOpen={false}
      open={isDetailsOpen}
      onOpenChange={setIsDetailsOpen}
      isStreaming={isStreaming}
      className={cn('mb-0 mt-1 min-w-0 max-w-full overflow-hidden', className)}
    >
      <ReasoningTrigger
        className="min-h-9 text-adam-text-secondary hover:text-adam-text-primary"
        showIcon={false}
        getThinkingMessage={(streaming, duration) => {
          if (streaming || duration === 0) {
            return <Shimmer duration={1}>{`${thinkingVerb}...`}</Shimmer>;
          }
          if (duration === undefined) {
            return <p>Thought for a few seconds</p>;
          }
          return <p>Thought for {duration} seconds</p>;
        }}
      />
      {isDetailsOpen ? (
        <ChatReasoningBody isStreaming={isStreaming}>{text}</ChatReasoningBody>
      ) : null}
    </Reasoning>
  );
}

function ChatReasoningBody({
  children,
  isStreaming,
}: {
  children: string;
  isStreaming: boolean;
}) {
  const isLarge = children.length > 5000;

  return (
    <CollapsibleContent
      className={cn(
        'mt-4 min-w-0 max-w-full overflow-hidden text-sm text-adam-text-secondary outline-none',
        'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2',
        'data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
      )}
    >
      {isLarge ? (
        <VirtualizedReasoning text={children} isStreaming={isStreaming} />
      ) : (
        <StandardReasoning text={children} isStreaming={isStreaming} />
      )}
    </CollapsibleContent>
  );
}

function StandardReasoning({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isStreaming) return;
    const viewport = scrollRootRef.current?.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport]',
    );
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [text, isStreaming]);

  return (
    <ScrollArea
      ref={scrollRootRef}
      className="min-w-0 max-w-full overflow-hidden pr-3 [&_[data-radix-scroll-area-viewport]]:max-h-72 [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden"
    >
      <div className="chat-markdown min-w-0 max-w-full overflow-hidden">
        <Streamdown parseIncompleteMarkdown plugins={streamdownPlugins}>
          {text}
        </Streamdown>
      </div>
    </ScrollArea>
  );
}

function VirtualizedReasoning({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => splitReasoningBlocks(text), [text]);

  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 4,
  });

  useEffect(() => {
    if (!isStreaming || blocks.length === 0) return;
    virtualizer.scrollToIndex(blocks.length - 1, { align: 'end' });
  }, [blocks.length, isStreaming, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="max-h-80 w-full overflow-y-auto overflow-x-hidden pr-2 text-sm select-text scrollbar-thin scrollbar-thumb-adam-border-secondary scrollbar-track-transparent"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
            className="chat-markdown min-w-0 max-w-full overflow-hidden pb-3"
          >
            <Streamdown parseIncompleteMarkdown plugins={streamdownPlugins}>
              {blocks[virtualItem.index]}
            </Streamdown>
          </div>
        ))}
      </div>
    </div>
  );
}
