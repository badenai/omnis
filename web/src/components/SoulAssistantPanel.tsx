import { useState, useRef, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamSoulAssistant } from '../api/soul_assistant';
import type { ChatMessage } from '../api/query';

interface Props {
  currentSoul: string;
  onApply: (soul: string) => void;
  agentId?: string;
}

const TEMPLATES = [
  { label: 'YouTube Research', prompt: 'Generate a complete SOUL.md for a YouTube Research agent. Ask me about my specific topic first, then draft the soul.' },
  { label: 'News Monitor', prompt: 'Generate a complete SOUL.md for a News Monitor agent. Ask me about my specific topic first, then draft the soul.' },
  { label: 'Technical Deep-Dive', prompt: 'Generate a complete SOUL.md for a Technical Deep-Dive agent. Ask me about my specific topic first, then draft the soul.' },
  { label: 'Market Watcher', prompt: 'Generate a complete SOUL.md for a Market Watcher agent. Ask me about my specific topic first, then draft the soul.' },
];

const QUICK_ACTIONS = [
  { label: 'Generate soul draft', prompt: 'Generate a complete SOUL.md draft for this agent based on the current soul content.' },
  { label: 'Suggest eval questions', prompt: 'Suggest evaluation questions for this agent soul. Give me 3–5 specific test prompts.' },
  { label: "What's missing?", prompt: "What's missing from my current SOUL.md? What should I add or improve?" },
];

function extractCodeBlock(content: string): string | null {
  const match = content.match(/```(?:markdown)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

export default function SoulAssistantPanel({ currentSoul, onApply, agentId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: messageText };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);

    try {
      for await (const chunk of streamSoulAssistant({
        message: messageText,
        history: messages,
        currentSoul,
        agentId,
      })) {
        if (chunk.token) {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + chunk.token };
            return updated;
          });
        }
        if (chunk.error) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: `Error: ${chunk.error}` };
            return updated;
          });
        }
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: `Error: ${String(e)}` };
        return updated;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, currentSoul, agentId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>

      {/* Template chips + quick actions — only show when no messages yet */}
      {messages.length === 0 && (
        <div style={{ padding: '12px 14px 0', flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 0 }}>
            Templates
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => send(t.prompt)}
                disabled={loading}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  borderRadius: 99,
                  border: '1px solid var(--color-border-default)',
                  backgroundColor: 'var(--color-surface-2)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.color = 'var(--color-accent)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border-default)';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 0 }}>
            Quick actions
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.label}
                onClick={() => send(a.prompt)}
                disabled={loading}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  borderRadius: 99,
                  border: '1px solid var(--color-border-default)',
                  backgroundColor: 'var(--color-surface-2)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-accent-dim)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border-default)';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable message history */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((msg, i) => {
            const codeBlock = msg.role === 'assistant' && msg.content ? extractCodeBlock(msg.content) : null;
            return (
              <div key={i} style={{ display: 'flex', gap: 8, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: 'var(--color-accent-glow)', border: '1px solid var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-accent)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                )}

                <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={
                      msg.role === 'user'
                        ? { backgroundColor: 'var(--color-accent)', color: '#fff', borderRadius: 12, borderBottomRightRadius: 3, padding: '8px 12px', fontSize: 13, lineHeight: 1.5 }
                        : { backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, borderBottomLeftRadius: 3, padding: '8px 12px', fontSize: 13, lineHeight: 1.5 }
                    }
                  >
                    {msg.content === '' && msg.role === 'assistant' ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 16 }}>
                        {[0, 1, 2].map(j => (
                          <span
                            key={j}
                            className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ backgroundColor: 'var(--color-text-secondary)', animationDelay: `${j * 0.15}s` }}
                          />
                        ))}
                      </div>
                    ) : msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-strong:text-gray-100 prose-code:text-indigo-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 prose-li:text-gray-300 prose-a:text-indigo-400">
                        <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                      </div>
                    ) : (
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                    )}
                  </div>

                  {/* Apply button when code block found and loading is done */}
                  {codeBlock && !loading && (
                    <button
                      onClick={() => onApply(codeBlock)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 500,
                        borderRadius: 8,
                        border: '1px solid var(--color-accent-dim)',
                        backgroundColor: 'var(--color-accent-glow)',
                        color: 'var(--color-accent)',
                        cursor: 'pointer',
                        transition: 'background 150ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-dim)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-glow)')}
                    >
                      Apply to Editor →
                    </button>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-text-secondary)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{ padding: '8px 14px 14px', flexShrink: 0, borderTop: '1px solid var(--color-border-subtle)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backgroundColor: 'var(--color-surface-1)',
          border: `1px solid ${inputFocused ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
          borderRadius: 99,
          padding: '6px 6px 6px 12px',
          transition: 'border-color 150ms',
        }}>
          <textarea
            ref={inputRef}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-primary)',
              resize: 'none',
              outline: 'none',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.5,
              padding: 0,
            }}
            placeholder="Ask the soul architect..."
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              cursor: loading || !input.trim() ? 'default' : 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading || !input.trim() ? 0.45 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {loading ? (
              <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
