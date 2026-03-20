import AgentForm from './AgentForm';

export default function CreateAgent() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 32, maxWidth: 720, margin: '0 auto' }}>
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Deploy Agent
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          Configure a new knowledge agent.
        </p>
      </div>
      <AgentForm />
    </div>
    </div>
  );
}
