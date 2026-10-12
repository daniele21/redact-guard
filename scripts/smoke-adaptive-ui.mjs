// Adaptive Workspace browser journey with synthetic, isolated API data.
// This never uses real PII, Korgis, local files, or an external service.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.PLAYWRIGHT_MODULE || '/tmp/redactguard-playwright/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'it-IT',
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

let selected = 'test-model-a';
const baseline = {
  name: 'private_person', label: 'Nome di persona',
  description: 'A name that identifies a natural person.',
  examples: ['Mario Rossi'], color: 'pii-person', icon: 'User', is_custom: false,
};
let variant = null;
const documents = new Map();
const response = (route, data, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(data),
});
function policy() {
  const changed = variant ? { ...baseline, label: variant.label, description: variant.description, is_custom: true } : baseline;
  return {
    profile: 'general', base_types: [baseline], inherited_types: [baseline],
    effective_types: [changed], origins: { private_person: variant ? 'scoped' : 'predefined' },
    history: variant ? { private_person: [{ revision: 1, ...variant, enabled: true, created_at: '2026-10-12T00:00:00Z' }] } : {},
  };
}
function summary(id) {
  const doc = documents.get(id);
  const fields = doc.analyzed ? [doc.field] : [];
  const ent = fields.length ? [{
    entity_id: doc.field.entity_id, pii_type: doc.field.pii_type, label: doc.field.field_name,
    masked_value: 'Ma••••si', occurrence_count: 1, pages: [1],
    decision_counts: { redact: 1, keep: 0, not_pii: 0 },
    occurrences: [{ finding_id: doc.field.finding_id, page_number: 1, start: 10, end: 21 }],
  }] : [];
  return {
    document_id: id, filename: doc.filename, profile: 'general',
    contract_version: 'redactguard-detection-v2',
    analysis_status: doc.analyzed ? 'complete' : 'not_started',
    pages_total: 1, pages_analyzed: doc.analyzed ? 1 : 0, pages_failed: 0,
    pages_with_warnings: 0, affected_pages: doc.analyzed ? 1 : 0,
    unique_sensitive_items: fields.length, occurrences: fields.length, categories: [],
    decision_counts: { redact: fields.length, keep: 0, not_pii: 0 }, unresolved_findings: 0,
    page_status: { 1: doc.analyzed ? 'complete' : 'not_started' }, page_errors: {},
    entities: ent, resources: {
      inference_requests: doc.analyzed ? 1 : 0, cache_hits: 0, evidence_requests: 0,
      peak_memory_bytes: null, peak_memory_delta_bytes: null,
      average_cpu_percent: null, peak_cpu_percent: null, cpu_sample_count: null,
      sampling_interval_ms: null, cpu_observation_ms: null,
      memory_sources: [], cpu_sources: [], attribution_scopes: [], attribution_qualities: [],
    }, local_processing: true,
  };
}
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^\/api/, '');
  const method = route.request().method();
  if (path === '/health') return response(route, {
    status: 'ok', llm_status: 'online', model: selected, korgis_mode: 'managed',
    korgis_protocol_version: 'local-llm-identity-v1',
    korgis_compatibility: 'compatible', korgis_request_evidence_supported: true,
    cache_stats: {},
  });
  if (path === '/profiles') return response(route, [
    { name: 'general', display_name: 'Generale', description: '', pii_type_count: 1 },
  ]);
  if (path === '/profiles/custom-types') return response(route, []);
  if (path === '/profiles/general/policy') return response(route, policy());
  if (path === '/profiles/general/variants/private_person' && method === 'PUT') {
    variant = JSON.parse(route.request().postData() || '{}');
    return response(route, policy());
  }
  if (path === '/local-models' && method === 'GET') return response(route, {
    selected_model: selected, models: ['test-model-a','test-model-b'],
    selected_resident: true, discovery_available: true,
    hardware: { system: 'darwin', machine: 'arm64', logical_cpus: 10, total_memory_bytes: 17179869184 },
  });
  if (path === '/local-models/selection' && method === 'PUT') {
    selected = JSON.parse(route.request().postData() || '{}').model;
    return response(route, {
      selected_model: selected, models: ['test-model-a','test-model-b'],
      selected_resident: true, discovery_available: true,
    });
  }
  if (path === '/upload' && method === 'POST') {
    const id = 'doc-' + (documents.size + 1);
    const filename = documents.size ? 'secondo.pdf' : 'primo.pdf';
    const value = 'Mario Rossi';
    const field = {
      finding_id: 'occ_' + id, entity_id: 'ent_' + id, field_name: 'Nome di persona',
      field_description: baseline.description, pii_type: 'private_person',
      value, redacted_value: '[REDACTED_PRIVATE_PERSON]',
      start: 10, end: 21,
    };
    documents.set(id, { filename, analyzed: false, field, model: selected });
    return response(route, {
      doc_id: id, page_count: 1, profile: 'general', model: selected,
      policy_digest: 'synthetic-only',
      pages: [{ page_number: 1, char_count: 23, text: 'Contratto: Mario Rossi.' }],
    });
  }
  const match = path.match(/^\/analyze\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const doc = documents.get(match[1]);
    if (!doc) return response(route, { detail: 'Not found' }, 404);
    if (match[2] === 'summary' && method === 'GET') return response(route, summary(match[1]));
    if (match[2]?.startsWith('page/') || (!match[2] && method === 'POST')) {
      doc.analyzed = true;
      const result = {
        page_number: 1, has_pii: true, pii_fields: [doc.field],
        redacted_text: 'Contratto: [REDACTED_PRIVATE_PERSON].', cache_hit: false,
        warning: null, diagnostics: {
          model: doc.model, chunks: 1, cache_hits: 0, latency_ms: 12,
          input_tokens: null, output_tokens: null, finish_reasons: [],
          parsed_items: 1, resolved_items: 1, unresolved_items: 0,
        },
      };
      return response(route, match[2]?.startsWith('page/') ? result : { pages: [result] });
    }
  }
  if (path.startsWith('/redact/') && method === 'PATCH') {
    return response(route, {
      redacted_pages: [{ page_number: 1, text: 'Contratto: [REDACTED_PRIVATE_PERSON].' }],
      stats: { total_findings: 1, total_fields_redacted: 1, total_fields_kept: 0, total_fields_not_pii: 0, reviewed_findings: 1 },
    });
  }
  if (path === '/cache' && method === 'DELETE') return response(route, { cleared: true });
  return response(route, { detail: 'Synthetic browser endpoint is not defined: ' + path }, 404);
});

const screenshotDir = 'artifacts/adaptive-ux';
await mkdir(screenshotDir, { recursive: true });
const snap = name => page.screenshot({ path: screenshotDir + '/' + name + '.png', fullPage: true });
const app = process.env.APP_URL || 'http://127.0.0.1:3000';
try {
  await page.goto(app, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Proteggi ciò che condividi/ }).waitFor();
  await snap('01-home');
  assert.equal(await page.getByRole('navigation', { name: 'Spazi di lavoro' }).getByRole('button').count(), 2);

  await page.getByRole('button', { name: /Modelli locali e stato/ }).click();
  await page.getByRole('heading', { name: 'Il modello giusto, una sola volta.' }).waitFor();
  await page.getByText('test-model-b', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Usa questo modello' }).click();
  await page.getByText(/Scelta salvata/).waitFor();
  await page.locator('details').first().click();
  await snap('02-model-center');
  assert.equal(selected, 'test-model-b');

  await page.getByRole('navigation', { name: 'Spazi di lavoro' }).getByRole('button', { name: 'Libreria PII' }).click();
  await page.getByRole('heading', { name: 'Libreria PII' }).waitFor();
  await page.getByRole('button', { name: /Nome di persona/ }).click();
  await page.getByRole('button', { name: 'Personalizza' }).click();
  await page.getByLabel('Cosa deve riconoscere RedactGuard?').fill('Detect individual names in an employee agreement.');
  await page.getByRole('button', { name: 'Salva definizione' }).click();
  await page.getByText(/Variante del profilo salvata/).waitFor();
  await snap('03-policy-library');
  assert.ok(variant && variant.description.includes('employee agreement'));

  await page.getByRole('navigation', { name: 'Spazi di lavoro' }).getByRole('button', { name: 'Documenti' }).click();
  const file = Buffer.from('%PDF-1.4\nSynthetic content only\n%%EOF\n');
  await page.locator('input[type=file]').setInputFiles([
    { name: 'primo.pdf', mimeType: 'application/pdf', buffer: file },
    { name: 'secondo.pdf', mimeType: 'application/pdf', buffer: file },
  ]);
  await page.getByRole('button', { name: 'Importa documenti' }).click();
  await page.getByRole('heading', { name: 'Revisione del documento' }).waitFor();
  await page.getByRole('complementary', { name: 'Documenti della sessione' }).getByRole('button').first().waitFor();
  assert.equal(documents.size, 2);
  await snap('04-multi-document-review');
  assert.equal(await page.getByRole('button', { name: /Conferma ed esporta/ }).isDisabled(), true);

  await page.getByRole('button', { name: 'Analizza tutte' }).click();
  await page.getByText('1 entità rilevate').waitFor();
  await page.getByRole('button', { name: 'Nascondi rilevamenti' }).click();
  assert.equal(await page.getByRole('complementary', { name: 'Rilevamenti e decisioni' }).count(), 0);
  await snap('05-focused-document');
  await page.getByRole('button', { name: 'Mostra rilevamenti' }).click();
  await page.getByRole('complementary', { name: 'Rilevamenti e decisioni' }).waitFor();

  await page.getByRole('complementary', { name: 'Documenti della sessione' }).getByRole('button', { name: /secondo.pdf/ }).click();
  await page.getByRole('button', { name: /Conferma ed esporta/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Conferma ed esporta/ }).isDisabled(), true);
  await snap('06-isolated-unanalysed-document');

  assert.deepEqual(errors, []);
  console.log('Adaptive browser smoke passed: home, persistent resident model, scoped PII, multi-PDF, review and inspector.');
} finally {
  await browser.close();
}
