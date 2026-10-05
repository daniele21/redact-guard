export type ReviewDecision = 'redact' | 'keep' | 'not_pii';

export interface DetectionDiagnostics {
  contract_version: string;
  status: string;
  model: string;
  chunks: number;
  cache_hits: number;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  finish_reasons: string[];
  parsed_items: number;
  resolved_items: number;
  unresolved_items: number;
  inference_requests?: number;
  resource_evidence_requests?: number;
  peak_memory_bytes?: number | null;
  peak_memory_delta_bytes?: number | null;
  average_cpu_percent?: number | null;
  peak_cpu_percent?: number | null;
  resource_cpu_sample_count?: number | null;
  resource_sampling_interval_ms?: number | null;
  resource_attribution_scopes?: string[];
  resource_attribution_qualities?: string[];
}

export interface PIIField {
  finding_id: string;
  entity_id: string;
  field_name: string;
  field_description: string;
  pii_type: string;
  value: string;
  redacted_value: string;
  start: number | null;
  end: number | null;
}

export interface PageAnalysisResult {
  page_number: number;
  has_pii: boolean;
  pii_fields: PIIField[];
  redacted_text: string;
  warning?: string;
  cache_hit: boolean;
  diagnostics?: DetectionDiagnostics | null;
}

export interface BatchAnalysisResponse {
  pages: PageAnalysisResult[];
}

export interface UploadResponsePage {
  page_number: number;
  char_count: number;
  text: string;
}

export interface UploadResponse {
  doc_id: string;
  page_count: number;
  profile: string;
  pages: UploadResponsePage[];
}

export interface SensitiveEntityOccurrence {
  finding_id: string;
  page_number: number;
  start: number | null;
  end: number | null;
}

export interface SensitiveEntitySummary {
  entity_id: string;
  pii_type: string;
  label: string;
  masked_value: string;
  occurrence_count: number;
  pages: number[];
  decision_counts: Record<ReviewDecision, number>;
  occurrences: SensitiveEntityOccurrence[];
}

export interface CategoryAnalysisSummary {
  pii_type: string;
  label: string;
  occurrence_count: number;
}

export type DocumentAnalysisStatus =
  | 'not_started'
  | 'analyzing'
  | 'partial'
  | 'complete'
  | 'needs_attention'
  | 'failed';

export interface DocumentResourceSummary {
  inference_requests: number;
  cache_hits: number;
  evidence_requests: number;
  peak_memory_bytes: number | null;
  peak_memory_delta_bytes: number | null;
  average_cpu_percent: number | null;
  peak_cpu_percent: number | null;
  cpu_sample_count: number | null;
  sampling_interval_ms: number | null;
  attribution_scopes: string[];
  attribution_qualities: string[];
}

export interface DocumentAnalysisSummary {
  document_id: string;
  filename: string;
  profile: string;
  contract_version: string;
  analysis_status: DocumentAnalysisStatus;
  pages_total: number;
  pages_analyzed: number;
  pages_failed: number;
  pages_with_warnings: number;
  affected_pages: number;
  unique_sensitive_items: number;
  occurrences: number;
  categories: CategoryAnalysisSummary[];
  decision_counts: Record<ReviewDecision, number>;
  unresolved_findings: number;
  page_status: Record<string, string>;
  page_errors: Record<string, string>;
  entities: SensitiveEntitySummary[];
  resources: DocumentResourceSummary;
  local_processing: boolean;
}

export interface RedactRequestItem {
  field_id: string;
  decision: ReviewDecision;
}

export interface RedactedPage {
  page_number: number;
  text: string;
}

export interface RedactResponse {
  redacted_pages: RedactedPage[];
  stats: {
    total_findings: number;
    total_fields_redacted: number;
    total_fields_kept: number;
    total_fields_not_pii: number;
    reviewed_findings: number;
    [key: string]: number;
  };
}

export interface PIITypeDefinition {
  name: string;
  label: string;
  description: string;
  examples: string[];
  color: string;
  icon: string;
  is_custom: boolean;
}

export interface ProfileSummary {
  name: string;
  display_name: string;
  description: string;
  pii_type_count: number;
}

export interface ProfileDetail {
  name: string;
  display_name: string;
  description: string;
  pii_types: PIITypeDefinition[];
}

export interface HealthResponse {
  status: string;
  llm_status: 'online' | 'offline' | 'model_not_resident' | 'runtime_incompatible';
  model: string;
  korgis_mode: 'external' | 'managed';
  korgis_protocol_version: string | null;
  korgis_compatibility: 'compatible' | 'legacy_compatible' | 'identity_incompatible' | null;
  korgis_request_evidence_supported: boolean;
  cache_stats: Record<string, any>;
}
