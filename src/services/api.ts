import { createBackendBaseResolver } from './backendAddress';
import {
  UploadResponse,
  PageAnalysisResult,
  BatchAnalysisResponse,
  RedactResponse,
  RedactRequestItem,
  ProfileSummary,
  ProfileDetail,
  PIITypeDefinition,
  HealthResponse,
  DocumentAnalysisSummary,
  LocalModelCatalog,
  AnalysisJob,
  ScopedPolicyDetail,
} from '../types';

let API_BASE = '/api';

// Native IPC returns null until the actual API has passed its health check.
// Never cache an initial placeholder port or mask a native error as Vite proxy.
const resolveApiBase = createBackendBaseResolver(
  () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<number | null>('get_api_port');
  },
);

async function getBase(): Promise<string> {
  API_BASE = await resolveApiBase();
  return API_BASE;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const code = detail.code ? `${detail.code}: ` : '';
    return `${code}${detail.message ?? fallback}`;
  }
  return fallback;
}

export const api = {
  init: resolveApiBase,

  health: async (): Promise<HealthResponse> => {
    const base = await getBase();
    const res = await fetch(`${base}/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  upload: async (file: File, profile: string = 'general'): Promise<UploadResponse> => {
    const base = await getBase();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('profile', profile);

    const res = await fetch(`${base}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(await errorMessage(res, 'Upload failed'));
    }
    return res.json();
  },

  startAnalysisJob: async (docId: string, pages: number[], force: boolean = false): Promise<AnalysisJob> => {
    const base = await getBase();
    const res = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: docId, pages, force }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Impossibile accodare l’analisi.'));
    return res.json();
  },

  getAnalysisJob: async (jobId: string): Promise<AnalysisJob> => {
    const base = await getBase();
    const res = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Stato analisi non disponibile.'));
    return res.json();
  },

  getJobResults: async (jobId: string): Promise<PageAnalysisResult[]> => {
    const base = await getBase();
    const res = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}/results`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Risultati analisi non disponibili.'));
    return res.json();
  },

  cancelAnalysisJob: async (jobId: string): Promise<AnalysisJob> => {
    const base = await getBase();
    const res = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Impossibile annullare il job.'));
    return res.json();
  },

  analyzePage: async (
    docId: string,
    pageNum: number,
    force: boolean = false,
  ): Promise<PageAnalysisResult> => {
    const base = await getBase();
    const url = `${base}/analyze/${docId}/page/${pageNum}${force ? '?force=true' : ''}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      throw new Error(
        await errorMessage(res, `Failed to analyze page ${pageNum}`),
      );
    }
    return res.json();
  },

  analyzeBatch: async (docId: string): Promise<BatchAnalysisResponse> => {
    const base = await getBase();
    const res = await fetch(`${base}/analyze/${docId}`, { method: 'POST' });
    if (!res.ok) {
      throw new Error(await errorMessage(res, 'Failed to analyze document'));
    }
    return res.json();
  },

  getAnalysisSummary: async (docId: string): Promise<DocumentAnalysisSummary> => {
    const base = await getBase();
    const res = await fetch(`${base}/analyze/${docId}/summary`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(await errorMessage(res, 'Failed to load analysis summary'));
    }
    return res.json();
  },

  redact: async (
    docId: string,
    fieldsToRedact: RedactRequestItem[],
  ): Promise<RedactResponse> => {
    const base = await getBase();
    const res = await fetch(`${base}/redact/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields_to_redact: fieldsToRedact, review_attested: true }),
    });
    if (!res.ok) {
      throw new Error(await errorMessage(res, 'Failed to apply review decisions'));
    }
    return res.json();
  },

  getProfiles: async (): Promise<ProfileSummary[]> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles`);
    if (!res.ok) throw new Error('Failed to fetch profiles');
    return res.json();
  },

  getProfileDetail: async (name: string): Promise<ProfileDetail> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles/${name}`);
    if (!res.ok) throw new Error('Failed to fetch profile detail');
    return res.json();
  },

  getScopedPolicy: async (profile: string): Promise<ScopedPolicyDetail> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles/${encodeURIComponent(profile)}/policy`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Cannot load PII policy'));
    return res.json();
  },

  saveScopedVariant: async (profile: string, key: string, description: string, label: string): Promise<ScopedPolicyDetail> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles/${encodeURIComponent(profile)}/variants/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, label, enabled: true }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Cannot save PII variant'));
    return res.json();
  },

  restoreScopedVariant: async (profile: string, key: string): Promise<ScopedPolicyDetail> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles/${encodeURIComponent(profile)}/variants/${encodeURIComponent(key)}/restore`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Cannot restore PII definition'));
    return res.json();
  },

  revertScopedVariant: async (profile: string, key: string, revision: number): Promise<ScopedPolicyDetail> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles/${encodeURIComponent(profile)}/variants/${encodeURIComponent(key)}/revert/${revision}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Cannot restore PII revision'));
    return res.json();
  },

  getCustomTypes: async (): Promise<PIITypeDefinition[]> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles/custom-types`);
    if (!res.ok) throw new Error('Failed to fetch custom types');
    return res.json();
  },

  addCustomType: async (name: string, description: string): Promise<PIITypeDefinition> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles/custom-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      throw new Error(await errorMessage(res, 'Failed to add custom type'));
    }
    return res.json();
  },

  updateCustomType: async (
    currentName: string,
    name: string,
    description: string,
  ): Promise<PIITypeDefinition> => {
    const base = await getBase();
    const res = await fetch(
      `${base}/profiles/custom-types/${encodeURIComponent(currentName)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      },
    );
    if (!res.ok) {
      throw new Error(await errorMessage(res, 'Failed to update custom type'));
    }
    return res.json();
  },

  removeCustomType: async (name: string): Promise<void> => {
    const base = await getBase();
    const res = await fetch(
      `${base}/profiles/custom-types/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) throw new Error('Failed to remove custom type');
  },

  clearCache: async (): Promise<void> => {
    const base = await getBase();
    const res = await fetch(`${base}/cache`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Failed to clear local caches'));
  },

  getLocalModels: async (): Promise<LocalModelCatalog> => {
    const base = await getBase();
    const res = await fetch(`${base}/local-models`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Failed to read local models'));
    return res.json();
  },

  selectLocalModel: async (model: string): Promise<LocalModelCatalog> => {
    const base = await getBase();
    const res = await fetch(`${base}/local-models/selection`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Failed to choose local model'));
    return res.json();
  },

  downloadProtectedDocument: async (docId: string, originalFilename: string): Promise<void> => {
    const base = await getBase();
    const res = await fetch(`${base}/export/${encodeURIComponent(docId)}?format=md`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Impossibile esportare il documento.'));

    const stem = originalFilename.replace(/\.pdf$/i, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|[._]+$/g, '') || 'document';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = stem + '_protected.md';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      // Browsers can defer the navigation after link.click().
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  },

  exportDocumentUrl: (docId: string): string => {
    return `${API_BASE}/export/${docId}?format=md`;
  },

  clientReportUrl: (docId: string, download: boolean = false): string => {
    return `${API_BASE}/export/${docId}/report${download ? '?download=true' : ''}`;
  },
};
