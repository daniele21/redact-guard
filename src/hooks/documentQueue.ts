/** PDF import boundaries shared by queue and tests. No file content or path stored. */
export const MAX_PDFS_PER_SESSION = 25;
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export interface PdfCandidate {
  name: string;
  size: number;
}

export function validatePdfCandidate(file: PdfCandidate): string | null {
  if (!file.name.toLowerCase().endsWith('.pdf')) return 'Sono supportati soltanto documenti PDF.';
  if (file.size > MAX_PDF_BYTES) return 'Il PDF supera il limite di 50 MB.';
  return null;
}

export function validateSessionCapacity(existing: number, incoming: number): string | null {
  if (incoming < 1) return 'Seleziona almeno un PDF.';
  if (existing + incoming > MAX_PDFS_PER_SESSION) return 'La sessione supporta fino a 25 PDF.';
  return null;
}

export function updateById<T>(
  documents: Record<string, T>,
  id: string,
  updater: (current: T) => T,
): Record<string, T> {
  if (!Object.prototype.hasOwnProperty.call(documents, id)) return documents;
  return { ...documents, [id]: updater(documents[id]) };
}
