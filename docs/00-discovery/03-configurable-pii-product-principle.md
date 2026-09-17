# Configurable PII as a Product Principle

> Status: active product principle

## 1. Product thesis

RedactGuard should not be positioned primarily as "a local LLM that redacts documents".

Its strongest product idea is that **the definition of sensitive data is configuration, not application code**.

Different organizations, teams, customers, and document domains do not share one fixed definition of PII or sensitive information. A healthcare workflow may care about diagnoses and patient identifiers; a financial workflow may care about account identifiers; a company may also need to protect employee IDs, internal project names, customer codes, contractual references, or other organization-specific information.

RedactGuard therefore separates two concerns:

1. **PII policy / taxonomy** — what should be considered sensitive for this context;
2. **Detection and redaction engine** — the reusable local pipeline that applies that policy.

The product should make it possible to evolve the first without rewriting the second.

## 2. Core value proposition

> **Define what is sensitive. RedactGuard adapts the detection pipeline.**

A user should be able to start from a domain profile and then define, add, edit, or remove custom PII definitions without changing detection code.

The resulting product loop is:

**Configure taxonomy → Detect locally → Review findings → Redact deterministically → Export minimized content**

Local-first remains a major differentiator, but it supports the main product promise rather than replacing it:

- the taxonomy is adaptable;
- the detection is contextual;
- the processing stays local;
- the human remains in control.

## 3. Product behavior

### Base profiles

RedactGuard includes reusable YAML profiles for common domains such as general, healthcare, legal, and financial documents.

Profiles are starting points, not hard-coded product boundaries.

### Custom PII definitions

Users can maintain organization-specific definitions from the PII Taxonomy settings UI.

Each definition has:

- a stable machine-readable name;
- a human-readable label derived from the name;
- a natural-language description used as detection guidance for the local model.

Custom definitions are persisted locally and merged with the selected base profile. A custom definition with the same machine-readable name as a profile definition takes precedence.

### Changes propagate automatically

The active taxonomy is used to build the local model prompt. When a profile or custom PII definition changes, the prompt changes and therefore the LLM cache key changes as well. Users do not need to manually invalidate old inference results.

## 4. UX principle

The PII configuration experience should feel like maintaining a small policy catalog, not editing model prompts.

The settings UI should therefore communicate:

- **what is currently protected**;
- **which definitions come from the selected domain profile**;
- **which definitions are organization-specific**;
- **how to add or edit a definition in plain language**;
- **that changes apply to subsequent analyses automatically**.

Avoid exposing prompt-engineering terminology in the primary interaction. The description field should be framed as "what should RedactGuard identify?" rather than "write a prompt".

## 5. README visual plan

The README should eventually contain three purpose-built product images dedicated to this capability. Until final screenshots are available, the README contains explicit visual placeholders rather than broken image links.

### Visual A — Taxonomy overview and custom PII settings

**Asset:** `docs/assets/screenshots/redactguard-pii-settings.png`

**Purpose:** make the configurable taxonomy understandable in one glance.

**Composition:**

- full PII Taxonomy modal or settings page;
- base profiles visible in the upper area (Financial, General, Healthcare, Legal);
- custom PII definitions section visible below with self-service add controls;
- short product callout: "PII definitions are configuration, not code."

**What the reader should understand without reading the caption:** the user controls what RedactGuard considers sensitive.

### Visual B — Inspect profile PII detection strategy

**Asset:** `docs/assets/screenshots/redactguard-pii-profile-healthcare.png`

**Purpose:** prove that domain-specific detection rules and examples are inspectable and transparent.

**Composition:**

- one custom PII definition in edit mode;
- friendly name field;
- natural-language description field;
- Save and Cancel actions;
- example definition: "Employee ID" with a concise description such as "Internal employee identifiers assigned by the organization, including IDs such as EMP-10482.";
- surrounding UI visible enough to show that this is part of RedactGuard settings, not a code editor.

**What the reader should understand:** a domain expert can maintain the taxonomy without changing application code.

### Visual C — Configuration-to-detection proof

**Target filename:** `docs/assets/screenshots/redactguard-config-to-detection.jpg`

**Purpose:** connect configuration to the actual anonymization result.

**Composition:**

- left side: a custom definition such as `employee_id`;
- right side: a synthetic document review screen where `EMP-10482` is detected and highlighted as that custom PII type;
- a simple directional connector or two-panel layout;
- no real personal data.

**What the reader should understand:** changing the taxonomy changes what the engine looks for.

## 6. Screenshot production rules

All documentation screenshots for configurable PII should:

- use synthetic data only;
- use the real RedactGuard UI whenever possible rather than marketing mockups;
- keep the same theme, spacing, and viewport family as the existing README screenshots;
- crop around the product interaction instead of showing unnecessary browser chrome;
- keep custom PII examples domain-neutral enough to make the capability obvious;
- avoid implying benchmark accuracy or legal compliance;
- prefer one clear idea per screenshot.

## 7. Documentation hierarchy

The README should communicate the product in this order:

1. configurable PII taxonomy;
2. local contextual detection;
3. human review;
4. deterministic redaction and controlled export;
5. implementation details.

Architecture and model choice support the value proposition but should not become the primary reason to adopt the tool.

## 8. Product acceptance criteria

The configurable-PII promise is considered real when all of the following are true:

- users can list custom PII definitions;
- users can add a definition;
- users can edit or rename a definition;
- users can remove a definition;
- definitions persist locally across sessions;
- custom definitions are merged into the selected profile automatically;
- custom definitions affect subsequent local inference without code changes;
- configuration changes produce configuration-aware cache keys;
- the README demonstrates this capability before deep architecture details;
- screenshots make self-service maintenance visible.

## 9. Future evolution

Potential extensions should preserve the same product principle:

- create and save fully custom profiles;
- enable/disable individual PII definitions without deleting them;
- scope custom definitions to a profile, team, client, or workflow;
- import/export taxonomy configurations;
- version policies and show configuration history;
- add example values and negative examples to definitions;
- benchmark detection quality per PII definition.

These are extensions of the same idea: **the privacy policy should evolve independently from the anonymization engine.**
