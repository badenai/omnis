import type { ChannelSource } from '../types';

interface Props {
  channels: ChannelSource[];
  onChange: (channels: ChannelSource[]) => void;
}

export default function ChannelList({ channels, onChange }: Props) {
  const add = () => onChange([...channels, { handle: '' }]);

  const update = (i: number, value: string) => {
    const next = [...channels];
    next[i] = { handle: value };
    onChange(next);
  };

  const remove = (i: number) => onChange(channels.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {channels.map((ch, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={ch.handle}
            onChange={(e) => update(i, e.target.value)}
            placeholder="@ChannelHandle"
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="px-2 py-2 text-red-400 hover:text-red-300 text-sm"
          >
            x
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs font-medium text-gray-400 transition-colors"
      >
        + Add Channel
      </button>
    </div>
  );
}
