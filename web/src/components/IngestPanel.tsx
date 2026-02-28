import { useState, useRef, useEffect } from 'react';
import { useIngestUrl, useIngestFile, useChannelPreview, useChannelExecute } from '../api/agents';
import { useActivity } from '../api/scheduler';
import { useQueryClient } from '@tanstack/react-query';
import type { AgentDetail } from '../types';

interface Props {
  agent: AgentDetail;
}

const YT_RE = /youtube\.com|youtu\.be/;
const YT_CHANNEL_RE = /youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/UC[\w-]+|user\/[\w.-]+)\/?$/;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IngestPanel({ agent }: Props) {
  const ingestUrl = useIngestUrl(agent.agent_id);
  const ingestFile = useIngestFile(agent.agent_id);
  const { data: activity } = useActivity();
  const qc = useQueryClient();

  const [url, setUrl] = useState('');
  const [urlMessage, setUrlMessage] = useState('');

  const channelPreview = useChannelPreview(agent.agent_id);
  const channelExecute = useChannelExecute(agent.agent_id);
  const [channelConfirm, setChannelConfirm] = useState<{
    url: string;
    count: number;
    videos: { id: string; title: string }[];
  } | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileMessage, setFileMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Watch activity for manual-ingest jobs completing for this agent.
  // When one finishes, refresh the agent data so inbox_count updates immediately.
  const seenKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    const jobs = activity?.history ?? [];
    for (const job of jobs) {
      if (job.agent_id !== agent.agent_id) continue;
      if (!job.task.startsWith('manual-ingest')) continue;
      if (seenKeys.current.has(job.key)) continue;
      seenKeys.current.add(job.key);
      qc.invalidateQueries({ queryKey: ['agents', agent.agent_id] });
    }
  }, [activity, agent.agent_id, qc]);

  const isYouTube = YT_RE.test(url);
  const isChannel = YT_CHANNEL_RE.test(url);

  const handleIngestUrl = async () => {
    if (!url.trim()) return;
    setUrlMessage('');
    try {
      await ingestUrl.mutateAsync({ url: url.trim() });
      setUrlMessage('Queued for analysis — check Activity for progress.');
      setUrl('');
    } catch (err) {
      setUrlMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleScanChannel = async () => {
    if (!url.trim()) return;
    setUrlMessage('');
    setChannelConfirm(null);
    try {
      const preview = await channelPreview.mutateAsync(url.trim());
      if (preview.count > 50) {
        setChannelConfirm({ url: url.trim(), ...preview });
      } else {
        await channelExecute.mutateAsync({ url: url.trim(), limit: null });
        setUrlMessage(`Scanning ${preview.count} videos — check Activity for progress.`);
        setUrl('');
      }
    } catch (err) {
      setUrlMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleChannelConfirm = async (limit: number | null) => {
    const u = channelConfirm!.url;   // use the previewed URL, not current input
    setChannelConfirm(null);
    try {
      await channelExecute.mutateAsync({ url: u, limit });
      setUrlMessage('Scanning queued — check Activity for progress.');
      setUrl('');
    } catch (err) {
      setUrlMessage(`Error: ${(err as Error).message}`);
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setFileTitle(file.name.replace(/\.[^.]+$/, ''));
    setFileMessage('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleIngestFile = async () => {
    if (!selectedFile) return;
    setFileMessage('');
    try {
      await ingestFile.mutateAsync({ file: selectedFile, title: fileTitle || undefined });
      setFileMessage('Queued for analysis — check Activity for progress.');
      setSelectedFile(null);
      setFileTitle('');
    } catch (err) {
      setFileMessage(`Error: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">

      {/* URL section */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-200">Ingest URL</h3>
          <p className="text-xs text-gray-500 mt-0.5">YouTube video, article, or any webpage</p>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlMessage(''); setChannelConfirm(null); }}
              onKeyDown={(e) => e.key === 'Enter' && (isChannel ? handleScanChannel() : handleIngestUrl())}
              placeholder="https://..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
            {url && (
              <span className={`text-xs px-2 py-1 rounded font-medium shrink-0 ${
                isChannel ? 'bg-amber-900/50 text-amber-300' :
                isYouTube ? 'bg-red-900/50 text-red-300' :
                'bg-blue-900/50 text-blue-300'
              }`}>
                {isChannel ? 'Channel' : isYouTube ? 'YouTube' : 'Web'}
              </span>
            )}
          </div>
          {isChannel ? (
            <button
              onClick={handleScanChannel}
              disabled={!url.trim() || channelPreview.isPending || channelExecute.isPending}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
            >
              {channelPreview.isPending ? 'Fetching...' : 'Scan Channel'}
            </button>
          ) : (
            <button
              onClick={handleIngestUrl}
              disabled={!url.trim() || ingestUrl.isPending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
            >
              {ingestUrl.isPending ? 'Queuing...' : 'Ingest URL'}
            </button>
          )}
        </div>

        {channelConfirm && (
          <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-4 space-y-3">
            <p className="text-sm text-amber-300">
              This channel has <span className="font-bold">{channelConfirm.count} videos</span>. How many should be scanned?
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleChannelConfirm(50)}
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-xs font-medium transition-colors"
              >
                First 50
              </button>
              <button
                onClick={() => handleChannelConfirm(null)}
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-xs font-medium transition-colors"
              >
                All {channelConfirm.count}
              </button>
              <button
                onClick={() => setChannelConfirm(null)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {urlMessage && (
          <p className={`text-xs ${urlMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {urlMessage}
          </p>
        )}
      </div>

      {/* File section */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-200">Ingest File</h3>
          <p className="text-xs text-gray-500 mt-0.5">PDF, video, or image — analyzed by Gemini</p>
        </div>

        {!selectedFile ? (
          <label
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-lg p-8 cursor-pointer transition-colors text-center"
          >
            <span className="text-gray-400 text-sm">Drop file here or click to browse</span>
            <span className="text-gray-600 text-xs mt-1">.pdf · .mp4 · .mov · .webm · .mkv · .png · .jpg · .gif · .webp</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.mp4,.mov,.webm,.mkv,.png,.jpg,.jpeg,.gif,.webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
              <div className="text-sm text-gray-300 truncate">{selectedFile.name}</div>
              <div className="text-xs text-gray-500 shrink-0 ml-2">{formatBytes(selectedFile.size)}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title (optional)</label>
              <input
                type="text"
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleIngestFile}
                disabled={ingestFile.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
              >
                {ingestFile.isPending ? 'Queuing...' : 'Ingest File'}
              </button>
              <button
                onClick={() => { setSelectedFile(null); setFileTitle(''); setFileMessage(''); }}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm font-medium transition-colors text-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {fileMessage && (
          <p className={`text-xs ${fileMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {fileMessage}
          </p>
        )}
      </div>
    </div>
  );
}
