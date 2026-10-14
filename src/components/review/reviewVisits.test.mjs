import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePageVisits } from './reviewVisits.ts';

test('incremental page-two analysis preserves prior reviewed page one', () => {
  const pageOne = { pii_fields: [], page_number: 1 };
  const oldResults = { 1: pageOne };
  const nextResults = { 1: pageOne, 2: { pii_fields: [], page_number: 2 } };
  const reviewed = reconcilePageVisits(new Set([1]), oldResults, nextResults, {}, 1);
  assert.deepEqual([...reviewed], [1]);
  const afterPageTwoOpened = reconcilePageVisits(reviewed, nextResults, nextResults, {}, 2);
  assert.deepEqual([...afterPageTwoOpened], [1, 2]);
});

test('reanalysis of another page invalidates only that page', () => {
  const previous = { 1: { answer: 'first' }, 2: { answer: 'first' }, 3: { answer: 'unchanged' } };
  const next = { 1: previous[1], 2: { answer: 'updated' }, 3: previous[3] };
  const reviewed = reconcilePageVisits(new Set([1, 2, 3]), previous, next, {}, 1);
  assert.deepEqual([...reviewed], [1, 3]);
  const revisited = reconcilePageVisits(reviewed, next, next, {}, 2);
  assert.deepEqual([...revisited], [1, 3, 2]);
});

test('failed page and removed analysis invalidate review without sacrificing others', () => {
  const results = { 1: { answer: 1 }, 2: { answer: 2 }, 3: { answer: 3 } };
  const afterError = reconcilePageVisits(new Set([1, 2, 3]), results, results, { 2: 'failed' }, 1);
  assert.deepEqual([...afterError], [1, 3]);
  const afterRemoval = reconcilePageVisits(afterError, results, { 1: results[1], 2: results[2] }, {}, 1);
  assert.deepEqual([...afterRemoval], [1]);
});

test('unchanged visit state keeps the same set reference and does not churn render', () => {
  const result = { 1: {} };
  const visited = new Set([1]);
  assert.strictEqual(reconcilePageVisits(visited, result, result, {}, 1), visited);
});
