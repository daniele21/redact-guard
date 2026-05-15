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

const API_BASE = '/api';

export const api = {
  health: async (): Promise<HealthResponse> => {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  upload: async (file: File, profile: string = 'general'): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('profile', profile);

    const res = await fetch(`${API_BASE}/upload`, {
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
    const url = `${API_BASE}/analyze/${docId}/page/${pageNum}${force ? '?force=true' : ''}`;
    const res = await fetch(url, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`Failed to analyze page ${pageNum}`);
    return res.json();
  },

  analyzeBatch: async (docId: string): Promise<BatchAnalysisResponse> => {
    const res = await fetch(`${API_BASE}/analyze/${docId}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to analyze document');
    return res.json();
  },

  redact: async (docId: string, fieldsToRedact: RedactRequestItem[]): Promise<RedactResponse> => {
    const res = await fetch(`${API_BASE}/redact/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields_to_redact: fieldsToRedact })
    });
    if (!res.ok) throw new Error('Failed to apply redactions');
    return res.json();
  },

  getProfiles: async (): Promise<ProfileSummary[]> => {
    const res = await fetch(`${API_BASE}/profiles`);
    if (!res.ok) throw new Error('Failed to fetch profiles');
    return res.json();
  },

  getProfileDetail: async (name: string): Promise<ProfileDetail> => {
    const res = await fetch(`${API_BASE}/profiles/${name}`);
    if (!res.ok) throw new Error('Failed to fetch profile detail');
    return res.json();
  },

  getCustomTypes: async (): Promise<PIITypeDefinition[]> => {
    const res = await fetch(`${API_BASE}/profiles/custom-types`);
    if (!res.ok) throw new Error('Failed to fetch custom types');
    return res.json();
  },

  addCustomType: async (name: string, description: string): Promise<PIITypeDefinition> => {
    const res = await fetch(`${API_BASE}/profiles/custom-types`, {
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
    const res = await fetch(`${API_BASE}/profiles/custom-types/${name}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to remove custom type');
  },
  
  exportDocumentUrl: (docId: string): string => {
    return `${API_BASE}/export/${docId}?format=md`;
  }
};
