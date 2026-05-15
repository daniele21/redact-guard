export interface PIIField {
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

export interface RedactRequestItem {
  field_id: string; // Composite ID like: "{page}_{pii_type}_{value}"
  redact: boolean;
}

export interface RedactedPage {
  page_number: number;
  text: string;
}

export interface RedactResponse {
  redacted_pages: RedactedPage[];
  stats: Record<string, number>;
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
  llm_status: string;
  model: string;
  cache_stats: Record<string, any>;
}
