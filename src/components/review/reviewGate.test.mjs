import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewReadiness } from './reviewGate.ts';

const fixture = (overrides = {}) => ({
  pages: [{ page_number: 1, text: 'Synthetic document' }],
  analysisResults: { 1: { pii_fields: [], warning: undefined, diagnostics: { unresolved_items: 0 } } },
  analysisErrors: {},
  isAnalyzing: false,
  summary: {
    pages_analyzed: 1, pages_failed: 0, pages_with_warnings: 0,
    unresolved_findings: 0, analysis_status: 'complete',
  },
  ...overrides,
});

test('a complete analysis still requires the reviewer to open the page', () => {
  assert.equal(reviewReadiness(fixture(), 0, false).ready, false);
  assert.equal(reviewReadiness(fixture(), 1, false).ready, true);
});

test('missing or failed pages never qualify as zero PII', () => {
  assert.equal(reviewReadiness(fixture({ analysisResults: {} }), 1, false).ready, false);
  assert.equal(reviewReadiness(fixture({ analysisErrors: { 1: 'inference failed' } }), 1, false).ready, false);
});

test('warnings and unresolved spans block export', () => {
  assert.equal(reviewReadiness(fixture({ analysisResults: {
    1: { pii_fields: [], warning: 'Some spans unresolved', diagnostics: { unresolved_items: 1 } },
  } }), 1, false).ready, false);
  assert.equal(reviewReadiness(fixture({ summary: {
    pages_analyzed: 1, pages_failed: 0, pages_with_warnings: 1, unresolved_findings: 0, analysis_status: 'needs_attention',
  } }), 1, false).ready, false);
});

test('partial or absent backend summaries cannot be treated as complete', () => {
  assert.equal(reviewReadiness(fixture({ summary: null }), 1, false).ready, false);
  assert.equal(reviewReadiness(fixture({ summary: {
    pages_analyzed: 0, pages_failed: 0, pages_with_warnings: 0, unresolved_findings: 0, analysis_status: 'partial',
  } }), 1, false).ready, false);
});

test('every page in a multiple-page state requires review', () => {
  const state = fixture({
    pages: [{ page_number: 1 }, { page_number: 2 }],
    analysisResults: { 1: { pii_fields: [] }, 2: { pii_fields: [] } },
    summary: {
      pages_analyzed: 2, pages_failed: 0, pages_with_warnings: 0,
      unresolved_findings: 0, analysis_status: 'complete',
    },
  });
  assert.equal(reviewReadiness(state, 1, false).ready, false);
  assert.equal(reviewReadiness(state, 2, false).ready, true);
});

test('in-progress analysis or export blocks re-entry', () => {
  assert.equal(reviewReadiness(fixture({ isAnalyzing: true }), 1, false).ready, false);
  assert.equal(reviewReadiness(fixture(), 1, true).ready, false);
});
