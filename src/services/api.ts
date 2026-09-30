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
} from '../types';

let API_BASE = '/api';
let _resolvePromise: Promise<string> | null = null;

function resolveApiBase(): Promise<string> {
  if (!_resolvePromise) {
    _resolvePromise = (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const port = await invoke<number>('get_api_port');
        API_BASE = `http://127.0.0.1:${port}/api`;
      } catch {
        // Dev mode with Vite proxy.
      }
      return API_BASE;
    })();
  }
  return _resolvePromise;
}

async function getBase(): Promise<string> {
  await resolveApiBase();
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
      body: JSON.stringify({ fields_to_redact: fieldsToRedact }),
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

  exportDocumentUrl: (docId: string): string => {
    return `${API_BASE}/export/${docId}?format=md`;
  },

  clientReportUrl: (docId: string, download: boolean = false): string => {
    return `${API_BASE}/export/${docId}/report${download ? '?download=true' : ''}`;
  },
};
