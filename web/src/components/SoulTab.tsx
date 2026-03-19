import { useState } from 'react';
import type { AgentDetail } from '../types';
import SoulEditor from './SoulEditor';
import SoulAssistantPanel from './SoulAssistantPanel';
import EvalQuestionsPanel from './EvalQuestionsPanel';
import SoulEvolutionTab from './SoulEvolutionTab';

type SoulSubTab = 'edit' | 'evolve' | 'eval';

const SUB_TABS: { id: SoulSubTab; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'evolve', label: 'Evolve' },
  { id: 'eval', label: 'Eval Questions' },
];

interface Props {
  agentId: string;
  agent: AgentDetail;
  suggestionsData: { suggestions: string | null } | undefined;
  refetchSuggestions: () => void;
  isFetchingSuggestions: boolean;
}

export default function SoulTab({ agentId, agent, suggestionsData, refetchSuggestions, isFetchingSuggestions }: Props) {
  const [subTab, setSubTab] = useState<SoulSubTab>('edit');
  const [soul, setSoul] = useState(agent.soul);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border-subtle)',
        flexShrink: 0,
        padding: '0 6px',
        backgroundColor: 'var(--color-surface-2)',
      }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              padding: '8px 14px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: subTab === tab.id ? 600 : 400,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              border: 'none',
              borderBottom: subTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: subTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              transition: 'all 150ms',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Edit sub-tab */}
      {subTab === 'edit' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <div style={{
            flex: 1,
            padding: 20,
            borderRight: '1px solid var(--color-border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <SoulEditor agentId={agentId} soul={soul} onSoulChange={setSoul} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SoulAssistantPanel currentSoul={soul} onApply={setSoul} agentId={agentId} />
          </div>
        </div>
      )}

      {/* Evolve sub-tab */}
      {subTab === 'evolve' && (
        <SoulEvolutionTab
          agentId={agentId}
          soul={soul}
          hasSoulBackup={agent.has_soul_backup}
          suggestionsData={suggestionsData}
          refetchSuggestions={refetchSuggestions}
          isFetchingSuggestions={isFetchingSuggestions}
        />
      )}

      {/* Eval Questions sub-tab */}
      {subTab === 'eval' && (
        <EvalQuestionsPanel agentId={agentId} agent={agent} />
      )}
    </div>
  );
}
