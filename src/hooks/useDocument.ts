import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { updateById, validatePdfCandidate, validateSessionCapacity } from './documentQueue';
import type {
  DocumentAnalysisSummary, PageAnalysisResult, RedactRequestItem,
  RedactedPage, UploadResponse, AnalysisJob,
} from '../types';

export type AppStep = 'upload' | 'review' | 'export';

export interface DocumentState {
  docId: string | null;
  filename: string;
  profile: string;
  model: string;
  policyDigest: string;
  pages: UploadResponse['pages'];
  analysisResults: Record<number, PageAnalysisResult>;
  analysisErrors: Record<number, string>;
  summary: DocumentAnalysisSummary | null;
  redactedPages: RedactedPage[];
  isUploading: boolean;
  isAnalyzing: boolean;
  currentAnalyzingPage: number | null;
  pendingPages: number[];
  analyzedCount: number;
  job: AnalysisJob | null;
}

export interface ImportError {
  filename: string;
  message: string;
}

const emptyDocument = (): DocumentState => ({
  docId: null,
  filename: '',
  profile: 'general',
  model: '',
  policyDigest: '',
  pages: [],
  analysisResults: {},
  analysisErrors: {},
  summary: null,
  redactedPages: [],
  isUploading: false,
  isAnalyzing: false,
  currentAnalyzingPage: null,
  pendingPages: [],
  analyzedCount: 0,
  job: null,
});

const fromUpload = (file: File, uploaded: UploadResponse, summary: DocumentAnalysisSummary | null): DocumentState => ({
  ...emptyDocument(),
  docId: uploaded.doc_id,
  filename: file.name,
  profile: uploaded.profile,
  model: uploaded.model,
  policyDigest: uploaded.policy_digest,
  pages: uploaded.pages,
  summary,
});

/**
 * Canonical document/session owner in the frontend. Backend sessions remain
 * independent by doc_id; one failed PDF never becomes a successful empty document.
 */
export function useDocument() {
  const [byId, setById] = useState<Record<string, DocumentState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importingFile, setImportingFile] = useState('');
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const importing = useRef(false);
  const [activeJobs, setActiveJobs] = useState<Record<string, string>>({});
  const active = activeId ? byId[activeId] : undefined;
  const state = active ?? emptyDocument();

  const update = useCallback((docId: string, apply: (state: DocumentState) => DocumentState) => {
    setById(previous => updateById(previous, docId, apply));
  }, []);

  const refreshSummary = useCallback(async (docId: string) => {
    const summary = await api.getAnalysisSummary(docId);
    update(docId, previous => ({ ...previous, summary }));
    return summary;
  }, [update]);

  const uploadFiles = useCallback(async (files: File[], profile: string) => {
    if (importing.current) return { added: 0, errors: [{ filename: '', message: 'Importazione già in corso.' }] };
    const capacityError = validateSessionCapacity(order.length, files.length);
    if (capacityError) {
      const errors = [{ filename: '', message: capacityError }];
      setImportErrors(errors);
      return { added: 0, errors };
    }
    importing.current = true;
    setIsImporting(true);
    setImportErrors([]);
    const errors: ImportError[] = [];
    const ids: string[] = [];
    try {
      // Bounded sequential upload: existing local API creates one independent
      // backend document session per PDF. This is NOT fake client-side batch inference.
      for (const file of files) {
        setImportingFile(file.name);
        const validation = validatePdfCandidate(file);
        if (validation) {
          errors.push({ filename: file.name, message: validation });
          continue;
        }
        try {
          const uploaded = await api.upload(file, profile);
          let summary: DocumentAnalysisSummary | null = null;
          try {
            summary = await api.getAnalysisSummary(uploaded.doc_id);
          } catch {
            // Missing summary does not mean a successful analysis.
          }
          setById(previous => ({
            ...previous,
            [uploaded.doc_id]: fromUpload(file, uploaded, summary),
          }));
          setOrder(previous => [...previous, uploaded.doc_id]);
          ids.push(uploaded.doc_id);
        } catch (cause) {
          errors.push({
            filename: file.name,
            message: cause instanceof Error ? cause.message : 'Importazione non riuscita.',
          });
        }
      }
      if (ids.length) setActiveId(ids[0]);
      setImportErrors(errors);
      return { added: ids.length, errors };
    } finally {
      importing.current = false;
      setIsImporting(false);
      setImportingFile('');
    }
  }, [order.length]);

  const upload = useCallback(async (file: File, profile: string) => {
    const result = await uploadFiles([file], profile);
    if (result.errors.length) throw new Error(result.errors[0].message);
  }, [uploadFiles]);

  // The backend is the job owner. This hook persists above all workspace
  // screens and polls only status metadata, fetching PII results on completion.
  useEffect(() => {
    if (!Object.keys(activeJobs).length) return;
    let disposed = false;
    let busy = false;
    const poll = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        for (const docId of Object.keys(activeJobs)) {
          const jobId: string = activeJobs[docId];
          if (disposed) break;
          try {
            const job = await api.getAnalysisJob(jobId);
            if (disposed) break;
            update(docId, previous => ({
              ...previous,
              job,
              isAnalyzing: job.cancellable,
              currentAnalyzingPage: job.current_page,
              pendingPages: previous.pendingPages.filter(page => (
                !job.completed_pages.includes(page) && !Object.prototype.hasOwnProperty.call(job.page_errors, page)
              )),
            }));
            if (!job.cancellable) {
              const results = await api.getJobResults(jobId);
              if (disposed) break;
              update(docId, previous => {
                const analysisResults = { ...previous.analysisResults };
                for (const result of results) analysisResults[result.page_number] = result;
                return {
                  ...previous,
                  job,
                  isAnalyzing: false,
                  currentAnalyzingPage: null,
                  pendingPages: [],
                  analysisResults,
                  analysisErrors: { ...previous.analysisErrors, ...job.page_errors },
                  analyzedCount: Object.keys(analysisResults).length,
                  redactedPages: [],
                };
              });
              try { await refreshSummary(docId); } catch { /* job result remains explicit */ }
              if (!disposed) setActiveJobs(previous => {
                if (previous[docId] !== jobId) return previous;
                const next = { ...previous };
                delete next[docId];
                return next;
              });
            }
          } catch {
            // Network interruptions do not silently mark an active job complete.
            // Keep polling; backend status remains the authority.
          }
        }
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 1200);
    return () => { disposed = true; clearInterval(timer); };
  }, [activeJobs, update, refreshSummary]);

  const enqueue = async (pages: number[], force = false) => {
    const docId = activeId;
    if (!docId || !pages.length) return;
    try {
      const job = await api.startAnalysisJob(docId, pages, force);
      update(docId, previous => ({
        ...previous,
        job,
        isAnalyzing: true,
        pendingPages: pages,
        currentAnalyzingPage: null,
        analysisErrors: {},
      }));
      setActiveJobs(previous => ({ ...previous, [docId]: job.job_id }));
    } catch (cause) {
      update(docId, previous => ({
        ...previous,
        analysisErrors: {
          ...previous.analysisErrors,
          [pages[0]]: cause instanceof Error ? cause.message : 'Impossibile avviare l’analisi.',
        },
      }));
    }
  };

  const analyzePage = async (pageNumber: number, force = false) => {
    await enqueue([pageNumber], force);
  };

  const batchAnalyzePages = async (pageNumbers: number[], force = false) => {
    await enqueue(pageNumbers, force);
  };

  const cancelAnalysis = async (docId: string) => {
    const jobId = activeJobs[docId];
    if (!jobId) return;
    const job = await api.cancelAnalysisJob(jobId);
    update(docId, previous => ({ ...previous, job }));
  };

  const applyRedactions = async (decisions: RedactRequestItem[]) => {
    const docId = activeId;
    if (!docId) return;
    const result = await api.redact(docId, decisions);
    update(docId, previous => ({ ...previous, redactedPages: result.redacted_pages }));
    try { await refreshSummary(docId); } catch { /* keep previous safe summary */ }
  };

  const reset = useCallback(() => {
    for (const docId of Object.keys(activeJobs)) { void api.cancelAnalysisJob(activeJobs[docId]).catch(() => {}); }
    setActiveJobs({});
    setById({});
    setOrder([]);
    setActiveId(null);
    setImportErrors([]);
  }, [activeJobs]);

  return {
    state,
    documents: order.map(id => byId[id]).filter((item): item is DocumentState => Boolean(item)),
    activeId, selectDocument: setActiveId,
    upload, uploadFiles, importingFile, isImporting, importErrors,
    analyzePage, batchAnalyzePages, cancelAnalysis, applyRedactions, refreshSummary, reset,
    activeJobCount: Object.keys(activeJobs).length,
  };
}
