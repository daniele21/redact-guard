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
const jobs = new Map();
let lastJob = 0;
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
  const analyzedPages = [...doc.analyzedPages].sort((a, b) => a - b);
  const fields = analyzedPages.map(n => ({ ...doc.field, finding_id: doc.field.finding_id + '-' + n }));
  const ent = fields.length ? [{
    entity_id: doc.field.entity_id, pii_type: doc.field.pii_type, label: doc.field.field_name,
    masked_value: 'Ma••••si', occurrence_count: fields.length, pages: analyzedPages,
    decision_counts: { redact: fields.length, keep: 0, not_pii: 0 },
    occurrences: analyzedPages.map(n => ({ finding_id: doc.field.finding_id + '-' + n, page_number: n, start: 10, end: 21 })),
  }] : [];
  return {
    document_id: id, filename: doc.filename, profile: 'general',
    contract_version: 'redactguard-detection-v2',
    analysis_status: analyzedPages.length === doc.pageCount ? 'complete' : analyzedPages.length ? 'partial' : 'not_started',
    pages_total: doc.pageCount, pages_analyzed: analyzedPages.length, pages_failed: 0,
    pages_with_warnings: 0, affected_pages: analyzedPages.length,
    unique_sensitive_items: fields.length, occurrences: fields.length, categories: [],
    decision_counts: { redact: fields.length, keep: 0, not_pii: 0 }, unresolved_findings: 0,
    page_status: Object.fromEntries(Array.from({ length: doc.pageCount }, (_, i) => {
      const n = i + 1;
      return [n, doc.analyzedPages.has(n) ? 'complete' : 'not_started'];
    })), page_errors: {},
    entities: ent, resources: {
      inference_requests: analyzedPages.length, cache_hits: 0, evidence_requests: 0,
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
    choices: [
      { model_id: 'test-model-a', startup_key: 'test-model-a', downloaded: true, resident: true },
      { model_id: 'test-model-b', startup_key: 'test-model-b', downloaded: true, resident: true },
      { model_id: 'Qwen/Qwen3.5-4B', startup_key: 'qwen3.5-4b-q4km', downloaded: true, resident: false },
      { model_id: 'Qwen/Qwen3.5-9B', startup_key: 'qwen3.5-9b-q4km', downloaded: false, resident: false },
    ],
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
    const pageCount = documents.size === 0 ? 2 : 1;
    documents.set(id, { filename, pageCount, analyzedPages: new Set(), field, model: selected });
    return response(route, {
      doc_id: id, page_count: pageCount, profile: 'general', model: selected,
      policy_digest: 'synthetic-only',
      pages: Array.from({ length: pageCount }, (_, i) => ({
        page_number: i + 1, char_count: 23, text: 'Contratto: Mario Rossi.',
      })),
    });
  }
  if (path === '/jobs' && method === 'POST') {
    const input = JSON.parse(route.request().postData() || '{}');
    const doc = documents.get(input.document_id);
    if (!doc) return response(route, { detail: 'Missing document' }, 404);
    const id = 'job-' + ++lastJob;
    jobs.set(id, {
      id, docId: input.document_id, pages: input.pages, force: Boolean(input.force),
      status: 'queued', polls: 0, currentPage: null, completed: [],
    });
    return response(route, {
      job_id: id, document_id: input.document_id, status: 'queued',
      pages_total: input.pages.length, pages_completed: 0, completed_pages: [],
      current_page: null, page_errors: {}, cancellable: true,
    }, 202);
  }
  const jobMatch = path.match(/^\/jobs\/([^/]+)(?:\/(results|cancel))?$/);
  if (jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) return response(route, { detail: 'Unknown job' }, 404);
    if (jobMatch[2] === 'cancel' && method === 'POST') job.status = 'cancelled';
    if (!jobMatch[2] && method === 'GET' && job.status !== 'cancelled') {
      job.polls++;
      if (job.polls >= 3) {
        job.status = 'complete';
        job.completed = job.pages;
        job.currentPage = null;
        const doc = documents.get(job.docId);
        for (const n of job.pages) doc.analyzedPages.add(n);
      } else {
        job.status = 'running';
        job.currentPage = job.pages[0];
      }
    }
    if (jobMatch[2] === 'results') {
      const doc = documents.get(job.docId);
      return response(route, job.completed.map(n => ({
        page_number: n, has_pii: true,
        pii_fields: [{ ...doc.field, finding_id: doc.field.finding_id + '-' + n }],
        redacted_text: 'Contratto: [REDACTED_PRIVATE_PERSON].', cache_hit: false,
        warning: null,
      })));
    }
    return response(route, {
      job_id: job.id, document_id: job.docId, status: job.status,
      pages_total: job.pages.length, pages_completed: job.completed.length,
      completed_pages: job.completed, current_page: job.currentPage,
      page_errors: {}, cancellable: ['queued','running','cancelling'].includes(job.status),
    });
  }
  const match = path.match(/^\/analyze\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const doc = documents.get(match[1]);
    if (!doc) return response(route, { detail: 'Not found' }, 404);
    if (match[2] === 'summary' && method === 'GET') return response(route, summary(match[1]));
    if (match[2]?.startsWith('page/') || (!match[2] && method === 'POST')) {
      const pageNumber = Number(match[2]?.split('/')[1] ?? 1);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.pageCount) {
        return response(route, { detail: 'Invalid page' }, 404);
      }
      doc.analyzedPages.add(pageNumber);
      const field = { ...doc.field, finding_id: doc.field.finding_id + '-' + pageNumber };
      const result = {
        page_number: pageNumber, has_pii: true, pii_fields: [field],
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
    const id = path.split('/')[2];
    const doc = documents.get(id);
    const payload = JSON.parse(route.request().postData() || '{}');
    if (!doc || doc.analyzedPages.size !== doc.pageCount || payload.review_attested !== true) {
      return response(route, { detail: 'Cannot export without complete review' }, 409);
    }
    return response(route, {
      redacted_pages: Array.from({ length: doc.pageCount }, (_, i) =>
        ({ page_number: i + 1, text: 'Contratto: [REDACTED_PRIVATE_PERSON].' })),
      stats: { total_findings: doc.pageCount, total_fields_redacted: doc.pageCount, total_fields_kept: 0, total_fields_not_pii: 0, reviewed_findings: doc.pageCount },
    });
  }
  if (path.startsWith('/export/') && method === 'GET' && !path.endsWith('/report')) {
    return route.fulfill({
      status: 200,
      contentType: 'text/markdown; charset=utf-8',
      headers: { 'content-disposition': 'attachment; filename="synthetic-protected.md"' },
      body: Array.from({ length: documents.get(path.split('/')[2])?.pageCount ?? 1 }, () =>
        'Contratto: [REDACTED_PRIVATE_PERSON].').join('\n\n---\n\n'),
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

  await page.locator('button[title="Modelli locali e stato di Korgis"]').click();
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
  await page.getByText(/analisi in coda o in corso nel backend locale/i).waitFor();
  await page.getByRole('navigation', { name: 'Spazi di lavoro' }).getByRole('button', { name: 'Libreria PII' }).click();
  await page.getByRole('heading', { name: 'Libreria PII' }).waitFor();
  assert.equal([...jobs.values()][0].status !== 'complete', true);
  await page.getByRole('button', { name: 'Apri documenti' }).click();
  await page.getByRole('heading', { name: 'Revisione del documento' }).waitFor();
  await page.getByText('1 entità rilevate').waitFor();
  await page.getByText('2/2 pagine analizzate').waitFor();
  // Opening page 1 before analysis of page 2 must be remembered.
  assert.equal(await page.getByRole('button', { name: /Conferma ed esporta/ }).isDisabled(), true);
  await page.getByRole('button', { name: 'Pagina successiva' }).click();
  await page.getByText('2/2 pagine aperte').waitFor();
  assert.equal(await page.getByRole('button', { name: /Conferma ed esporta/ }).isDisabled(), false);
  // Reanalysis must not reset the reviewed state of an unchanged page 1.
  await page.getByRole('button', { name: 'Rianalizza pagina' }).click();
  await page.getByText('2/2 pagine aperte').waitFor();
  await page.getByRole('button', { name: 'Pagina precedente' }).click();
  await page.getByRole('button', { name: 'Nascondi rilevamenti' }).click();
  assert.equal(await page.getByRole('complementary', { name: 'Rilevamenti e decisioni' }).count(), 0);
  await snap('05-focused-document');
  await page.getByRole('button', { name: 'Mostra rilevamenti' }).click();
  await page.getByRole('complementary', { name: 'Rilevamenti e decisioni' }).waitFor();

  await page.getByRole('complementary', { name: 'Documenti della sessione' }).getByRole('button', { name: /secondo.pdf/ }).click();
  await page.getByRole('button', { name: /Conferma ed esporta/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Conferma ed esporta/ }).isDisabled(), true);
  await snap('06-isolated-unanalysed-document');

  // Inspect source without inadvertently changing the privacy-safe decision.
  await page.getByRole('complementary', { name: 'Documenti della sessione' })
    .getByRole('button', { name: /primo.pdf/ }).click();
  const originalCanvas = page.getByLabel('Testo originale del documento');
  const sourceFinding = originalCanvas.getByRole('button', { name: /Decisione attuale: Oscura/ });
  await sourceFinding.waitFor();
  assert.match(await sourceFinding.textContent(), /Mario Rossi/);
  await sourceFinding.focus();
  await page.keyboard.press('Enter');
  await originalCanvas.getByRole('button', { name: /Decisione attuale: Mantieni/ }).waitFor();
  await page.keyboard.press('Enter');
  await sourceFinding.waitFor();
  await snap('07-source-verification');

  // Smaller Mac windows must preserve an operable review and avoid horizontal clipping.
  await page.setViewportSize({ width: 960, height: 700 });
  await page.getByRole('heading', { name: 'Revisione del documento' }).waitFor();
  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 2
  );
  assert.equal(horizontalOverflow, false, 'Review should not overflow horizontally in a compact desktop window');
  await snap('08-compact-review');
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: /Conferma ed esporta/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Conferma ed esporta/ }).isDisabled(), false);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Conferma ed esporta/ }).click();
  await page.getByRole('heading', { name: 'Revisione completata' }).waitFor();
  await page.getByText(/Contratto: \[REDACTED_PRIVATE_PERSON\]/).first().waitFor();
  await snap('09-protected-markdown');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Scarica documento protetto/ }).click(),
  ]);
  assert.match(download.suggestedFilename(), /\.md$/);

  assert.deepEqual(errors, []);
  console.log('Adaptive browser smoke passed: model, scoped PII, multi-PDF, multi-page incremental review, reanalysis, keyboard and protected download.');
} finally {
  await browser.close();
}
