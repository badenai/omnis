import { useState } from 'react';
import { useInbox } from '../api/knowledge';

export interface InboxItem {
  timestamp: string;
  channel: string;
  videoId: string;
  title: string;
  relevanceScore: number;
  suggestedAction: string;
  suggestedTarget: string;
  insights: string[];
  summary: string;
  raw: string;
}

export function parseInboxItem(raw: string): InboxItem {
  const lines = raw.split('\n');

  const headerMatch = lines[0]?.match(/^##\s+(.+?)\s+\|\s+(.+?)\s+\|\s+(.+)$/);
  const timestamp = headerMatch?.[1]?.trim() ?? '';
  const channel = headerMatch?.[2]?.trim() ?? '';
  const videoId = headerMatch?.[3]?.trim() ?? '';

  const titleMatch = raw.match(/\*\*Title:\*\*\s*(.+)/);
  const title = titleMatch?.[1]?.trim() ?? '';

  const scoreMatch = raw.match(/\*\*Relevance Score:\*\*\s*([\d.]+)/);
  const relevanceScore = parseFloat(scoreMatch?.[1] ?? '0');

  const actionMatch = raw.match(/\*\*Suggested Action:\*\*\s*(\S+)\s*->\s*`([^`]+)`/);
  const suggestedAction = actionMatch?.[1]?.trim() ?? '';
  const suggestedTarget = actionMatch?.[2]?.trim() ?? '';

  const insightsMatch = raw.match(/###\s+Key Insights\n([\s\S]*?)(?=###|$)/);
  const insightsBlock = insightsMatch?.[1] ?? '';
  const insights = insightsBlock
    .split('\n')
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.replace(/^-\s*/, '').trim());

  const summaryMatch = raw.match(/###\s+Summary\n([\s\S]*?)$/);
  const summary = summaryMatch?.[1]?.trim() ?? '';

  return { timestamp, channel, videoId, title, relevanceScore, suggestedAction, suggestedTarget, insights, summary, raw };
}

function scoreColor(score: number): string {
  if (score >= 0.7) return 'var(--color-status-ok)';
  if (score >= 0.4) return 'var(--color-status-warn)';
  return 'var(--color-status-error)';
}

function scoreBg(score: number): string {
  if (score >= 0.7) return 'rgba(34,197,94,0.12)';
  if (score >= 0.4) return 'rgba(234,179,8,0.12)';
  return 'rgba(239,68,68,0.12)';
}

interface CardProps {
  item: InboxItem;
}

function InboxCard({ item }: CardProps) {
  const [expanded, setExpanded] = useState(false);

  const formattedTime = (() => {
    try {
      return new Date(item.timestamp).toLocaleString();
    } catch {
      return item.timestamp;
    }
  })();

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{
        backgroundColor: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Top row: timestamp + channel */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className="text-[10px]"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
        >
          {formattedTime}
        </span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-accent)',
            backgroundColor: 'var(--color-accent-glow)',
            border: '1px solid var(--color-accent-dim)',
          }}
        >
          {item.channel}
        </span>
      </div>

      {/* Title */}
      <div className="text-sm font-medium leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {item.title || item.videoId}
      </div>

      {/* Chips row: score + action */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{
            fontFamily: 'var(--font-mono)',
            color: scoreColor(item.relevanceScore),
            backgroundColor: scoreBg(item.relevanceScore),
          }}
        >
          score {item.relevanceScore.toFixed(2)}
        </span>
        {item.suggestedAction && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-surface-3)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            {item.suggestedAction} → {item.suggestedTarget}
          </span>
        )}
      </div>

      {/* Expandable: insights + summary */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[10px] flex items-center gap-1 transition-colors"
        style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
      >
        <svg
          className="w-3 h-3 transition-transform"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? 'Collapse' : 'Show details'}
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          {item.insights.length > 0 && (
            <div>
              <div
                className="text-[9px] uppercase tracking-widest mb-1.5"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
              >
                Key Insights
              </div>
              <ul className="space-y-1">
                {item.insights.map((ins, i) => (
                  <li
                    key={i}
                    className="text-xs flex gap-2"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span style={{ color: 'var(--color-accent)', flexShrink: 0 }}>·</span>
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {item.summary && (
            <div>
              <div
                className="text-[9px] uppercase tracking-widest mb-1.5"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
              >
                Summary
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {item.summary}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  agentId: string;
}

export default function InboxPanel({ agentId }: Props) {
  const { data, isLoading } = useInbox(agentId);
  const items = (data?.items ?? []).map(parseInboxItem).reverse(); // newest first

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: 'var(--color-text-muted)' }}>
        <div
          className="w-4 h-4 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-accent-dim)', borderTopColor: 'var(--color-accent)' }}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 gap-3"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">Inbox is empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <InboxCard key={i} item={item} />
      ))}
    </div>
  );
}
