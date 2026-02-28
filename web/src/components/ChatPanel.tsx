import { useState, useRef, useEffect, useCallback } from 'react';
import { streamQuery, type ChatMessage } from '../api/query';

export default function ChatPanel({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Add empty assistant message that we'll stream into
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center ring-1 ring-indigo-500/20">
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-300">Ask your expert anything</p>
              <p className="text-xs text-gray-500 mt-1">Questions are answered from accumulated knowledge</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-indigo-500/20">
                <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
            )}

            <div className={`max-w-[78%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-gray-800/80 text-gray-100 border border-white/5 rounded-bl-sm'
              }`}>
                {msg.content === '' && msg.role === 'assistant' ? (
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map(j => (
                      <span
                        key={j}
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${j * 0.15}s` }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 px-1">
                  {msg.sources.map(s => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 text-[10px] bg-gray-900 text-gray-400 rounded-md px-2 py-0.5 font-mono ring-1 ring-white/5"
                    >
                      <svg className="w-2.5 h-2.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {s.split('/').pop()}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-white/10">
                <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/5 bg-gray-900/30">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 bg-gray-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 resize-none overflow-hidden leading-relaxed"
            placeholder="Ask your expert... (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={e => {
              setInput(e.target.value);
              // Auto-grow
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors shrink-0 flex items-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
