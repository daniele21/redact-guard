import { PIIField } from '../../types';

export function fieldId(field: PIIField, pageNumber: number): string {
  return field.finding_id || `${pageNumber}_${field.pii_type}_${field.value}`;
}
