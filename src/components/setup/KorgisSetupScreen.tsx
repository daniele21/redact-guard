import React from 'react';

interface Props {
  status: 'offline' | 'model_not_resident';
  model: string;
  protocolVersion: string | null;
  onRetry: () => void;
}

export function KorgisSetupScreen({ status, model, protocolVersion, onRetry }: Props) {
  const offline = status === 'offline';
  const commands = [
    'uv run --frozen local-llm download ' + model,
    'uv run --frozen local-llm serve --model ' + model + ' --no-download',
  ].join('\n');

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
          <span className="text-primary font-bold text-sm">AI</span>
        </div>

        <h1 className="text-2xl font-bold text-on-surface mb-2">
          {offline ? 'Korgis is not running' : 'RedactGuard model is not resident'}
        </h1>
        <p className="text-on-surface-variant mb-6">
          RedactGuard no longer embeds or downloads its own LLM runtime. Korgis is the local runtime
          authority for model download, lifecycle, backend selection and inference.
        </p>

        <div className="bg-surface-variant rounded-xl p-4 mb-4 border border-outline-variant">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold text-on-surface">Required model</dt>
            <dd className="font-mono text-on-surface-variant">{model}</dd>
            <dt className="font-semibold text-on-surface">Korgis endpoint</dt>
            <dd className="font-mono text-on-surface-variant">http://127.0.0.1:1235/v1</dd>
            <dt className="font-semibold text-on-surface">Identity protocol</dt>
            <dd className="font-mono text-on-surface-variant">
              {protocolVersion ?? 'local-llm-identity-v1'}
            </dd>
          </dl>
        </div>

        <div className="bg-surface-variant/50 rounded-xl p-4 mb-6 border border-outline-variant">
          <p className="font-semibold text-on-surface text-sm mb-3">
            {offline ? 'Start Korgis with the configured model' : 'Make the configured model resident in Korgis'}
          </p>
          <pre className="text-xs text-on-surface-variant overflow-x-auto whitespace-pre-wrap font-mono">
            {commands}
          </pre>
        </div>

        <button
          onClick={onRetry}
          className="w-full bg-primary text-on-primary font-semibold py-3 px-6 rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          Retry Korgis connection
        </button>

        <p className="text-xs text-on-surface-variant mt-4 text-center">
          RedactGuard sends document text only to the Korgis instance configured on your machine.
        </p>
      </div>
    </div>
  );
}
