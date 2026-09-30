from __future__ import annotations

import html
from datetime import datetime, timezone

from domain.models import DocumentAnalysisSummary


def _esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""))


def _status(summary: DocumentAnalysisSummary) -> tuple[str, str]:
    if summary.pages_failed:
        return (
            "Analysis incomplete",
            f"{summary.pages_failed} page(s) could not be analyzed.",
        )
    if summary.unresolved_findings or summary.pages_with_warnings:
        return (
            "Needs attention",
            "The document was analyzed, but some findings require attention.",
        )
    if summary.pages_analyzed == summary.pages_total and summary.pages_total:
        return (
            "Protection review complete",
            "All pages were analyzed and no unresolved findings remain.",
        )
    return (
        "Analysis incomplete",
        f"{summary.pages_analyzed} of {summary.pages_total} pages were analyzed.",
    )


def render_client_report(summary: DocumentAnalysisSummary) -> str:
    """Render a shareable, read-only protection report without exposing raw PII."""
    status_title, status_description = _status(summary)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    decisions = summary.decision_counts
    categories = "".join(
        f"""
        <tr>
          <td>{_esc(category.label)}</td>
          <td>{_esc(category.occurrence_count)}</td>
        </tr>
        """
        for category in summary.categories
    ) or "<tr><td colspan='2'>No sensitive categories detected.</td></tr>"

    exceptions = []
    if summary.pages_failed:
        exceptions.append(
            f"<li><strong>{summary.pages_failed}</strong> page(s) failed analysis.</li>"
        )
    if summary.pages_with_warnings:
        exceptions.append(
            f"<li><strong>{summary.pages_with_warnings}</strong> page(s) completed with warnings.</li>"
        )
    if summary.unresolved_findings:
        exceptions.append(
            f"<li><strong>{summary.unresolved_findings}</strong> model-proposed finding(s) could not be resolved to source text.</li>"
        )
    if decisions.get("keep", 0):
        exceptions.append(
            f"<li><strong>{decisions.get('keep', 0)}</strong> occurrence(s) were explicitly retained by the reviewer.</li>"
        )
    if decisions.get("not_pii", 0):
        exceptions.append(
            f"<li><strong>{decisions.get('not_pii', 0)}</strong> occurrence(s) were dismissed as not PII.</li>"
        )
    exception_html = (
        "<ul>" + "".join(exceptions) + "</ul>"
        if exceptions
        else "<p class='muted'>No review exceptions recorded.</p>"
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RedactGuard Protection Report — {_esc(summary.filename)}</title>
<style>
:root {{
  color-scheme: light;
  --ink:#18201f;
  --muted:#64706e;
  --border:#dfe6e4;
  --surface:#f5f8f7;
  --panel:#ffffff;
  --accent:#136f63;
  --accent-soft:#e8f5f2;
  --warn:#9a6700;
  --warn-soft:#fff7df;
}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--surface);color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}}
main{{max-width:1040px;margin:0 auto;padding:48px 28px 72px}}
header{{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:28px}}
.brand{{font-weight:800;letter-spacing:-.02em;font-size:18px}}
.eyebrow{{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}}
h1{{font-size:32px;line-height:1.15;margin:6px 0 8px;letter-spacing:-.03em}}
.muted{{color:var(--muted)}}
.badge{{display:inline-block;padding:6px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:12px}}
.panel{{background:var(--panel);border:1px solid var(--border);border-radius:22px;padding:24px;margin-bottom:18px}}
.status{{display:flex;justify-content:space-between;gap:24px;align-items:center}}
.status strong{{font-size:20px}}
.grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}}
.metric{{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px}}
.metric span{{display:block;color:var(--muted);font-size:12px}}
.metric strong{{display:block;font-size:28px;margin-top:7px;letter-spacing:-.03em}}
.two{{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}}
table{{width:100%;border-collapse:collapse}}
th,td{{padding:11px 0;border-bottom:1px solid var(--border);text-align:left}}
th:last-child,td:last-child{{text-align:right}}
ul{{margin:0;padding-left:18px}}
footer{{margin-top:28px;padding-top:18px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:20px;color:var(--muted);font-size:11px}}
@media(max-width:760px){{.grid{{grid-template-columns:repeat(2,1fr)}}.two{{grid-template-columns:1fr}}header,.status,footer{{flex-direction:column}}}}
@media print{{body{{background:white}}main{{max-width:none;padding:22mm}}.panel,.metric{{break-inside:avoid}}}}
</style>
</head>
<body>
<main>
<header>
  <div>
    <div class="brand">RedactGuard</div>
    <div class="eyebrow">Protection report</div>
    <h1>{_esc(summary.filename)}</h1>
    <div class="muted">{_esc(summary.profile)} policy</div>
  </div>
  <div class="badge">Processed locally</div>
</header>

<section class="panel status">
  <div>
    <div class="eyebrow">Protection status</div>
    <strong>{_esc(status_title)}</strong>
    <div class="muted">{_esc(status_description)}</div>
  </div>
  <div><strong>{summary.pages_analyzed}/{summary.pages_total}</strong><br><span class="muted">pages analyzed</span></div>
</section>

<section class="grid">
  <div class="metric"><span>Sensitive items</span><strong>{summary.unique_sensitive_items}</strong></div>
  <div class="metric"><span>Occurrences</span><strong>{summary.occurrences}</strong></div>
  <div class="metric"><span>Affected pages</span><strong>{summary.affected_pages}</strong></div>
  <div class="metric"><span>Categories</span><strong>{len(summary.categories)}</strong></div>
</section>

<section class="two" style="margin-top:18px">
  <div class="panel">
    <div class="eyebrow">Sensitive data footprint</div>
    <h2>Categories detected</h2>
    <table><thead><tr><th>Category</th><th>Occurrences</th></tr></thead><tbody>{categories}</tbody></table>
  </div>
  <div class="panel">
    <div class="eyebrow">Protection outcome</div>
    <h2>Reviewer decisions</h2>
    <table>
      <tbody>
        <tr><td>Redacted</td><td>{decisions.get("redact", 0)}</td></tr>
        <tr><td>Explicitly retained</td><td>{decisions.get("keep", 0)}</td></tr>
        <tr><td>Dismissed as not PII</td><td>{decisions.get("not_pii", 0)}</td></tr>
        <tr><td>Unresolved findings</td><td>{summary.unresolved_findings}</td></tr>
      </tbody>
    </table>
  </div>
</section>

<section class="panel">
  <div class="eyebrow">Exceptions</div>
  <h2>Items requiring attention</h2>
  {exception_html}
</section>

<footer>
  <span>Generated {_esc(generated_at)} · Detection contract {_esc(summary.contract_version)}</span>
  <span>Report contains aggregated information only. Raw sensitive values are intentionally excluded.</span>
</footer>
</main>
</body>
</html>"""
