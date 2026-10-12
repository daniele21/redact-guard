import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePdfCandidate, validateSessionCapacity, updateById } from './documentQueue.ts';

test('PDF import is explicitly restricted to supported files and sizes', () => {
  assert.equal(validatePdfCandidate({ name: 'contract.PDF', size: 1_000 }), null);
  assert.match(validatePdfCandidate({ name: 'report.docx', size: 1_000 }), /PDF/);
  assert.match(validatePdfCandidate({ name: 'oversized.pdf', size: 50 * 1024 * 1024 + 1 }), /50 MB/);
});

test('session capacity is bounded and reports errors', () => {
  assert.equal(validateSessionCapacity(12, 13), null);
  assert.match(validateSessionCapacity(25, 1), /25 PDF/);
  assert.match(validateSessionCapacity(0, 0), /almeno un PDF/);
});

test('document updates stay isolated by doc_id', () => {
  const original = { a: { pages: 2, status: 'pending' }, b: { pages: 4, status: 'pending' } };
  const next = updateById(original, 'b', state => ({ ...state, status: 'complete' }));
  assert.equal(next.a, original.a);
  assert.equal(next.b.status, 'complete');
  assert.equal(original.b.status, 'pending');
  assert.equal(updateById(next, 'unknown', state => state), next);
});
