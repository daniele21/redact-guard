import React from 'react';

interface Props {
  status: 'offline' | 'model_not_resident' | 'runtime_incompatible';
  mode: 'external' | 'managed';
  model: string;
  protocolVersion: string | null;
  requestEvidenceSupported: boolean;
  onRetry: () => void;
}

export function KorgisSetupScreen({
  status,
  mode,
  model,
  protocolVersion,
  requestEvidenceSupported,
  onRetry,
}: Props) {
  const external = mode === 'external';
  const offline = status === 'offline';
  const incompatible = status === 'runtime_incompatible';
  const commands = [
    'uv run --frozen local-llm download ' + model,
    'uv run --frozen local-llm serve --model ' + model + ' --no-download',
  ].join('\n');

  const title = incompatible
    ? 'Korgis runtime is incompatible'
    : offline
      ? external
        ? 'Korgis is not running'
        : 'Managed Korgis did not start'
      : 'RedactGuard model is not resident';

  const description = incompatible
    ? 'Managed RedactGuard requires a Korgis build that supports the expected runtime identity and request-evidence contracts.'
    : external
      ? 'RedactGuard uses your separately managed Korgis instance for model lifecycle, inference and resource evidence.'
      : 'RedactGuard manages a separate local Korgis process. Korgis remains responsible for model lifecycle, inference and resource telemetry.';

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
          <span className="text-primary font-bold text-sm">AI</span>
        </div>

        <h1 className="text-2xl font-bold text-on-surface mb-2">{title}</h1>
        <p className="text-on-surface-variant mb-6">{description}</p>

        <div className="bg-surface-variant rounded-xl p-4 mb-4 border border-outline-variant">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold text-on-surface">Runtime mode</dt>
            <dd className="font-mono text-on-surface-variant">{mode}</dd>
            <dt className="font-semibold text-on-surface">Required model</dt>
            <dd className="font-mono text-on-surface-variant">{model}</dd>
            {external && (
              <>
                <dt className="font-semibold text-on-surface">Korgis endpoint</dt>
                <dd className="font-mono text-on-surface-variant">Configured external endpoint</dd>
              </>
            )}
            <dt className="font-semibold text-on-surface">Identity protocol</dt>
            <dd className="font-mono text-on-surface-variant">
              {protocolVersion ?? 'unavailable'}
            </dd>
            <dt className="font-semibold text-on-surface">Resource evidence</dt>
            <dd className="font-mono text-on-surface-variant">
              {requestEvidenceSupported ? 'korgis-request-evidence-v1' : 'unavailable'}
            </dd>
          </dl>
        </div>

        {external && !incompatible && (
          <div className="bg-surface-variant/50 rounded-xl p-4 mb-6 border border-outline-variant">
            <p className="font-semibold text-on-surface text-sm mb-3">
              {offline
                ? 'Start Korgis with the configured model'
                : 'Make the configured model resident in Korgis'}
            </p>
            <pre className="text-xs text-on-surface-variant overflow-x-auto whitespace-pre-wrap font-mono">
              {commands}
            </pre>
          </div>
        )}

        {incompatible && (
          <div className="bg-error/5 rounded-xl p-4 mb-6 border border-error/20">
            <p className="text-sm text-on-surface-variant">
              {external
                ? 'Update the external Korgis instance, then retry the connection.'
                : 'This packaged Korgis runtime must be replaced by a compatible RedactGuard build. The app will not silently downgrade the managed runtime contract.'}
            </p>
          </div>
        )}

        <button
          onClick={onRetry}
          className="w-full bg-primary text-on-primary font-semibold py-3 px-6 rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          Retry Korgis connection
        </button>

        <p className="text-xs text-on-surface-variant mt-4 text-center">
          Document inference remains local. RedactGuard does not provide a cloud fallback.
        </p>
      </div>
    </div>
  );
}
