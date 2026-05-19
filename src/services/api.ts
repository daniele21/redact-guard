import {
  UploadResponse,
  PageAnalysisResult,
  BatchAnalysisResponse,
  RedactResponse,
  RedactRequestItem,
  ProfileSummary,
  ProfileDetail,
  PIITypeDefinition,
  HealthResponse
} from '../types';

// In dev mode (Vite proxy), use relative path.
// In production (Tauri), resolve the actual backend port.
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
        // Not running in Tauri (dev mode with Vite proxy) — keep relative path
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

export const api = {
  /** Must be called once before any other API call in Tauri production mode */
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
      const error = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || 'Upload failed');
    }
    return res.json();
  },

  analyzePage: async (docId: string, pageNum: number, force: boolean = false): Promise<PageAnalysisResult> => {
    const base = await getBase();
    const url = `${base}/analyze/${docId}/page/${pageNum}${force ? '?force=true' : ''}`;
    const res = await fetch(url, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`Failed to analyze page ${pageNum}`);
    return res.json();
  },

  analyzeBatch: async (docId: string): Promise<BatchAnalysisResponse> => {
    const base = await getBase();
    const res = await fetch(`${base}/analyze/${docId}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to analyze document');
    return res.json();
  },

  redact: async (docId: string, fieldsToRedact: RedactRequestItem[]): Promise<RedactResponse> => {
    const base = await getBase();
    const res = await fetch(`${base}/redact/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields_to_redact: fieldsToRedact })
    });
    if (!res.ok) throw new Error('Failed to apply redactions');
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
      body: JSON.stringify({ name, description })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to add custom type' }));
      throw new Error(error.detail || 'Failed to add custom type');
    }
    return res.json();
  },

  removeCustomType: async (name: string): Promise<void> => {
    const base = await getBase();
    const res = await fetch(`${base}/profiles/custom-types/${name}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to remove custom type');
  },
  
  exportDocumentUrl: (docId: string): string => {
    return `${API_BASE}/export/${docId}?format=md`;
  }
};
