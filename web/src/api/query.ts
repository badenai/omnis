export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

export async function* streamQuery(
  agentId: string,
  message: string,
  history: ChatMessage[]
): AsyncGenerator<{ token?: string; sources?: string[]; error?: string; done?: boolean }> {
  const res = await fetch(`/api/query/${agentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        content: h.content,
      })),
    }),
  });

  if (!res.ok) throw new Error(`Query failed: ${res.status}`);
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') {
        yield { done: true };
        return;
      }
      try {
        yield JSON.parse(raw);
      } catch {
        // skip malformed
      }
    }
  }
}
