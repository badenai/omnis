import type { ChatMessage } from './query';

export async function* streamSoulAssistant(params: {
  message: string;
  history: ChatMessage[];
  currentSoul: string;
  agentId?: string;
}): AsyncGenerator<{ token?: string; error?: string; done?: boolean }> {
  const res = await fetch('/api/soul-assistant/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.message,
      history: params.history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        content: h.content,
      })),
      current_soul: params.currentSoul,
      agent_id: params.agentId ?? null,
    }),
  });

  if (!res.ok) throw new Error(`Soul assistant failed: ${res.status}`);
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
