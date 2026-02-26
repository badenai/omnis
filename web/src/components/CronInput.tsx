interface Props {
  value: string;
  onChange: (v: string) => void;
}

const PRESETS: Record<string, string> = {
  'Every hour': '0 * * * *',
  'Daily 8 AM': '0 8 * * *',
  'Daily midnight': '0 0 * * *',
  'Weekly Sunday 3 AM': '0 3 * * 0',
  'Every 6 hours': '0 */6 * * *',
};

export default function CronInput({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        pattern="[0-9*/,\-\s]+"
        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500"
        placeholder="0 3 * * 0"
      />
      <div className="flex flex-wrap gap-1">
        {Object.entries(PRESETS).map(([label, cron]) => (
          <button
            key={cron}
            type="button"
            onClick={() => onChange(cron)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              value === cron
                ? 'bg-indigo-600/30 text-indigo-300'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
