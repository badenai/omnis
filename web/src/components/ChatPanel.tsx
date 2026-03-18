import { useState, useRef, useEffect, useCallback } from 'react';
import { streamQuery, type ChatMessage } from '../api/query';

export default function ChatPanel({ agentId, soul }: { agentId: string; soul?: string }) {
  const storageKey = `omnis_chat_${agentId}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`omnis_chat_${agentId}`);
      return saved ? (JSON.parse(saved) as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch { /* storage full — silently skip */ }
  }, [messages, storageKey, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    let sources: string[] = [];

    try {
      for await (const chunk of streamQuery(agentId, text, messages)) {
        if (chunk.token) {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + chunk.token };
            return updated;
          });
        }
        if (chunk.sources) {
          sources = chunk.sources;
        }
        if (chunk.error) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: `Error: ${chunk.error}` };
            return updated;
          });
        }
      }
      if (sources.length > 0) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], sources };
          return updated;
        });
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
  }, [input, loading, messages, agentId]);

  const handleReset = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(storageKey);
    setConfirmReset(false);
  }, [storageKey]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const subtitle = soul?.split(/[.!?]/)[0]?.trim() ?? "Questions are answered from your agent's accumulated knowledge.";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Scrollable messages area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', paddingBottom: 48 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(79,127,255,0.20) 0%, rgba(79,127,255,0.06) 100%)',
              border: '1px solid var(--color-accent-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-accent)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 20, marginBottom: 0, textAlign: 'center' }}>
              How can I assist <em style={{ fontStyle: 'italic' }}>today?</em>
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', maxWidth: 400, textAlign: 'center', lineHeight: 1.6, marginTop: 10, marginBottom: 0 }}>
              {subtitle}
            </p>
          </div>
        ) : (
          <div style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'var(--color-accent-glow)', border: '1px solid var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-accent)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                  )}

                  <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div
                      className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                      style={
                        msg.role === 'user'
                          ? { backgroundColor: 'var(--color-accent)', color: '#fff', borderBottomRightRadius: 4 }
                          : { backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderBottomLeftRadius: 4 }
                      }
                    >
                      {msg.content === '' && msg.role === 'assistant' ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 16 }}>
                          {[0, 1, 2].map(j => (
                            <span key={j} className="w-1.5 h-1.5 rounded-full animate-bounce"
                              style={{ backgroundColor: 'var(--color-text-secondary)', animationDelay: `${j * 0.15}s` }} />
                          ))}
                        </div>
                      ) : (
                        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                      )}
                    </div>

                    {msg.sources && msg.sources.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {msg.sources.map(s => (
                          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', borderRadius: 6, padding: '2px 8px', backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)' }}>
                            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-accent)' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {s.split('/').pop()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-text-secondary)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area — all constrained to 680px centered */}
      <div style={{ padding: '0 24px 28px', flexShrink: 0 }}>
        <div>

          {/* Keyboard hint */}
          <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-muted)', margin: '0 0 8px', fontFamily: 'var(--font-mono)' }}>
            Press ↵ to send · ⇧↵ for newline
          </p>

          {/* Pill — houses both the normal input and the reset confirmation */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--color-surface-1)',
            border: `1px solid ${confirmReset ? 'var(--color-border-default)' : inputFocused ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
            borderRadius: 99,
            padding: '8px 8px 8px 12px',
            transition: 'border-color 150ms',
            minHeight: 52,
          }}>

            {/* ── Normal input layer ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              opacity: confirmReset ? 0 : 1,
              transform: confirmReset ? 'scale(0.97)' : 'scale(1)',
              transition: 'opacity 160ms ease, transform 160ms ease',
              pointerEvents: confirmReset ? 'none' : 'auto',
            }}>
              {/* Reset chat icon button (only when conversation exists) or decorative chat icon */}
              {messages.length > 0 && !loading ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  title="Reset chat"
                  style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none',
                    border: '1px solid var(--color-border-subtle)',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    transition: 'color 120ms, border-color 120ms, background 120ms',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                    e.currentTarget.style.borderColor = 'var(--color-border-default)';
                    e.currentTarget.style.background = 'var(--color-surface-2)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                    e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              ) : (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              )}

              <textarea
                ref={inputRef}
                rows={1}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  color: 'var(--color-text-primary)', resize: 'none', outline: 'none',
                  fontSize: 14, fontFamily: 'var(--font-sans)', lineHeight: 1.5, padding: 0,
                }}
                placeholder="Ask anything..."
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                disabled={loading}
              />

              <button
                onClick={send}
                disabled={loading || !input.trim()}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  backgroundColor: 'var(--color-accent)', color: '#fff',
                  border: 'none', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: loading || !input.trim() ? 'default' : 'pointer',
                  opacity: loading || !input.trim() ? 0.45 : 1,
                  transition: 'opacity 150ms',
                }}
              >
                {loading ? (
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </button>
            </div>

            {/* ── Confirm reset layer (overlays the pill) ── */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 99,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              padding: '0 12px',
              opacity: confirmReset ? 1 : 0,
              transform: confirmReset ? 'scale(1)' : 'scale(0.97)',
              transition: 'opacity 160ms ease, transform 160ms ease',
              pointerEvents: confirmReset ? 'auto' : 'none',
            }}>
              <button
                onClick={() => setConfirmReset(false)}
                style={{
                  fontSize: 12, fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-muted)', background: 'none',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 7, cursor: 'pointer', padding: '4px 12px',
                  transition: 'color 120ms, border-color 120ms, background 120ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.borderColor = 'var(--color-border-default)';
                  e.currentTarget.style.background = 'var(--color-surface-2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--color-text-muted)';
                  e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                  e.currentTarget.style.background = 'none';
                }}
              >
                Cancel
              </button>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                Reset this conversation?
              </span>
              <button
                onClick={handleReset}
                style={{
                  fontSize: 12, fontFamily: 'var(--font-mono)',
                  color: '#f87171', background: 'none',
                  border: '1px solid rgba(248,113,113,0.35)',
                  borderRadius: 7, cursor: 'pointer', padding: '4px 12px',
                  transition: 'color 120ms, border-color 120ms, background 120ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#fca5a5';
                  e.currentTarget.style.borderColor = 'rgba(248,113,113,0.6)';
                  e.currentTarget.style.background = 'rgba(248,113,113,0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#f87171';
                  e.currentTarget.style.borderColor = 'rgba(248,113,113,0.35)';
                  e.currentTarget.style.background = 'none';
                }}
              >
                Reset
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
