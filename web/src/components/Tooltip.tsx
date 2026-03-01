export default function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1.5 inline-block align-middle" style={{ cursor: 'default' }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        color: 'var(--color-text-muted)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '50%',
        width: '13px',
        height: '13px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}>?</span>
      <span
        className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-56 rounded-lg px-3 py-2 text-xs pointer-events-none"
        style={{
          backgroundColor: 'var(--color-surface-3)',
          border: '1px solid var(--color-border-default)',
          color: 'var(--color-text-secondary)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 'normal',
          textTransform: 'none',
          letterSpacing: 'normal',
          lineHeight: '1.5',
        }}
      >
        {text}
      </span>
    </span>
  );
}
