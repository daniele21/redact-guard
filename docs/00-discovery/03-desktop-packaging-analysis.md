# RedactGuard — Desktop Packaging & Self-Install Analysis

## Obiettivo

Rendere RedactGuard installabile come applicazione desktop locale, con le seguenti proprietà:

- **Auto-installante**: l'utente scarica un artefatto e lo lancia, senza prerequisiti manuali
- **Sandboxed**: niente viene installato nel sistema operativo host; tutto vive in un ambiente isolato
- **Cross-platform**: macOS (primario), Linux, Windows
- **Offline-first**: zero dipendenze di rete post-installazione (modello LLM incluso o scaricato al primo avvio)

---

## Componenti da Impacchettare

| Componente | Runtime | Dimensione stimata | Note |
|---|---|---|---|
| Frontend React (Vite build) | Statico | ~2 MB | Servibile da qualsiasi HTTP server |
| Backend FastAPI | Python 3.13 | ~150 MB (venv) | Include docling, llama-cpp-python, fastapi |
| LLM Server (llama-cpp-python) | Python + nativo | Incluso nel venv | Richiede compilazione con Metal/CUDA |
| Modello GGUF (Nemotron Q4_K_M) | File statico | ~2.5 GB | Download separato o bundled |
| Dipendenze native (cmake, compilatori) | Sistema | Variabile | Necessari solo per build di llama-cpp-python |

---

## Opzioni di Packaging

### Opzione A: Tauri + Python Sidecar

**Architettura**: App Tauri (Rust shell + WebView) che lancia il backend Python come sidecar process.

```
RedactGuard.app/
├── Contents/
│   ├── MacOS/
│   │   └── redactguard          # Binary Tauri (Rust)
│   ├── Resources/
│   │   ├── python/              # Python standalone (python-build-standalone)
│   │   ├── venv/                # Virtualenv pre-built
│   │   ├── backend/             # Codice Python del backend
│   │   ├── models/              # Modello GGUF (o scaricato al primo avvio)
│   │   └── frontend/            # Build statico Vite
│   └── Info.plist
```

**Pro**:
- App nativa leggera (~10 MB di shell vs ~150 MB di Electron)
- WebView di sistema (no Chromium bundled)
- Sandboxing nativo macOS/Windows
- Il frontend è già pronto (React)
- Tauri v2 supporta sidecar processes nativamente
- Firma e notarizzazione Apple gestibili

**Contro**:
- Complessità nella distribuzione di Python standalone cross-platform
- llama-cpp-python richiede compilazione platform-specific (pre-build per ogni target)
- Dimensione totale comunque ~3 GB con modello incluso
- Bisogna gestire lifecycle del processo Python (start/stop/crash recovery)

**Rischio principale**: la compilazione di llama-cpp-python con Metal/CUDA per ogni piattaforma target.

---

### Opzione B: Electron + Python Sidecar

**Architettura**: Electron shell che lancia backend Python come child process.

```
RedactGuard.app/
├── Contents/
│   ├── Resources/
│   │   ├── app/                 # Frontend Electron + build React
│   │   ├── python/              # Python embedded
│   │   ├── backend/             # Codice Python
│   │   └── models/              # Modello GGUF
```

**Pro**:
- Pattern maturo e ampiamente documentato (vedi LM Studio, Jan.ai)
- electron-builder gestisce firma, notarizzazione, auto-update
- Ecosistema di plugin per gestire processi sidecar
- Stesso modello usato da prodotti simili nel mercato LLM locale

**Contro**:
- Chromium bundled (+150 MB)
- Dimensione totale ~3.5 GB con modello
- Uso RAM più alto (Chromium + Python + LLM)
- Overkill dato che il frontend è già una SPA leggera

---

### Opzione C: Docker Desktop Wrapper

**Architettura**: Docker Compose con container per backend + frontend, orchestrato da uno script nativo o una piccola app tray.

```
redactguard/
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── models/                     # Volume montato
└── launcher/                   # App tray nativa (menubar icon)
    └── RedactGuard Launcher.app
```

**Pro**:
- Isolamento perfetto (vero sandbox)
- Riproducibilità garantita
- Nessuna contaminazione del sistema
- Facile aggiornamento (pull nuova immagine)

**Contro**:
- **Richiede Docker Desktop installato** (viola il requisito "zero prerequisiti")
- Accesso a GPU da container è complesso (no Metal da Docker su macOS)
- **LLM inference senza GPU è inutilizzabile** (troppo lento)
- Overhead di virtualizzazione
- UX peggiore (non è una "app", è un servizio)

**Verdict**: Non viable per il caso d'uso LLM locale con GPU acceleration su macOS.

---

### Opzione D: Nix Bundle / Hermetic Install Script

**Architettura**: Script installer che scarica un ambiente completamente hermetic (Python standalone + dipendenze pre-built) in una directory dedicata (`~/.redactguard/`).

```
~/.redactguard/
├── bin/
│   └── redactguard              # Entry point (bash/native)
├── python/                      # python-build-standalone
├── venv/                        # Pre-built o creato al primo avvio
├── backend/                     # Codice Python
├── frontend/                    # Build statico
├── models/                      # Modello GGUF
├── cache/                       # Cache applicativa
└── config.json
```

**Pro**:
- Zero dipendenze sul sistema (nemmeno Python installato)
- Disinstallazione = `rm -rf ~/.redactguard`
- Possibile distribuzione come .dmg (macOS), .AppImage (Linux), .msi (Windows)
- Modello scaricabile al primo avvio con progress bar
- Può usare GPU nativa senza limitazioni

**Contro**:
- Bisogna pre-compilare llama-cpp-python per ogni piattaforma/architettura
- Servono build matrix: macOS-arm64, macOS-x64, Linux-x64, Windows-x64
- Gestione aggiornamenti da costruire

---

### Opzione E: PyInstaller/PyApp + Launcher Nativo

**Architettura**: Backend Python compilato in un eseguibile standalone via PyInstaller o PyApp, con un launcher nativo minimale.

**Pro**:
- Single executable per il backend
- Familiare nell'ecosistema Python

**Contro**:
- PyInstaller ha problemi noti con llama-cpp-python e librerie native complesse
- Bundle size enorme e tempi di startup lenti
- Debugging difficile in produzione
- Anti-virus false positives su Windows

---

## Raccomandazione

### Approccio consigliato: **Opzione D (Hermetic Install) + Opzione A (Tauri Shell)**

Un approccio ibrido in due fasi:

#### Fase 1 — Hermetic Self-Install (MVP, bassa complessità)

1. **Installer script** (`install.sh` / `install.ps1`) che:
   - Scarica [python-build-standalone](https://github.com/indygreg/python-build-standalone) per la piattaforma
   - Crea venv isolato in `~/.redactguard/`
   - Installa dipendenze Python (con wheel pre-compilati per llama-cpp-python)
   - Copia backend + frontend build
   - Scarica modello GGUF (con progress bar e resume)
   - Crea symlink/alias per lanciare l'app

2. **Launcher script** (`redactguard`) che:
   - Avvia il backend Python (FastAPI + LLM server)
   - Avvia un server statico per il frontend (o usa FastAPI per servire anche gli asset)
   - Apre il browser di default su `http://localhost:3000`
   - Gestisce shutdown graceful (SIGTERM ai processi figli)

3. **Uninstall**: `rm -rf ~/.redactguard && rm /usr/local/bin/redactguard`

#### Fase 2 — Tauri Desktop App (polish, esperienza nativa)

1. Shell Tauri che wrappa il frontend in un WebView nativo
2. Backend Python lanciato come sidecar con lifecycle management
3. Distribuzione come `.dmg` (macOS), `.AppImage` (Linux), `.msi` (Windows)
4. Auto-update via Tauri updater
5. Tray icon con stato del server
6. Notarizzazione Apple

---

## Dettaglio Tecnico: Sfide Chiave

### 1. Python Standalone Distribution

**Soluzione**: [python-build-standalone](https://github.com/indygreg/python-build-standalone)
- Build pre-compilati di Python per ogni piattaforma
- ~30 MB compressi, ~100 MB estratti
- Nessuna dipendenza dal Python di sistema
- Usato da `rye`, `uv`, e altri tool moderni

### 2. llama-cpp-python con GPU

**Soluzione**: Pre-compilare wheel per ogni target:
- macOS arm64: Metal (default su Apple Silicon)
- macOS x64: CPU only (vecchi Mac)
- Linux x64: CUDA 12 + CPU fallback
- Windows x64: CUDA 12 + CPU fallback

Alternativa: usare [llama.cpp server](https://github.com/ggerganov/llama.cpp/tree/master/examples/server) come binary pre-compilato (già distribuito per ogni piattaforma) anziché llama-cpp-python. Questo semplificherebbe enormemente il packaging.

### 3. Download del Modello

**Strategia**:
- Non includere il modello nell'installer (troppo pesante: 2.5 GB)
- Al primo avvio, mostrare una schermata di setup che scarica il modello
- Supportare resume del download
- Permettere all'utente di puntare a un modello già presente
- Verificare integrità via SHA256

### 4. Gestione Porte

**Strategia**:
- Rilevare porte libere dinamicamente (non hardcodare 3000/8000/1235)
- Scrivere le porte attive in un file di lock (`~/.redactguard/run/ports.json`)
- Impedire avvii multipli (check su file di lock + PID)

### 5. Frontend come Static Build

**Modifica necessaria**: Il frontend deve poter essere configurato a runtime per le porte del backend:
- Opzione A: Servire il frontend direttamente da FastAPI (eliminare il dev server in produzione)
- Opzione B: Iniettare config via `window.__REDACTGUARD_CONFIG__` nel HTML servito

**Raccomandazione**: Servire il frontend da FastAPI in modalità produzione. Un solo processo da gestire (backend serve tutto).

---

## Struttura Target del Progetto

```
local-anonimizer/
├── installer/
│   ├── install-macos.sh
│   ├── install-linux.sh
│   ├── install-windows.ps1
│   ├── launcher.sh                # Entry point post-install
│   └── config/
│       └── default-config.json
├── desktop/                        # Fase 2: Tauri app
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   └── tauri.conf.json
│   └── ...
├── anonimizer/                     # Backend (invariato)
├── src/                            # Frontend (invariato)
├── dist/                           # Frontend build output
└── scripts/
    ├── build-release.sh            # Build completo per distribuzione
    └── download-model.py           # Script per download modello
```

---

## Confronto Sintetico

| Criterio | Tauri+Sidecar | Electron | Docker | Hermetic Script |
|---|---|---|---|---|
| Zero prerequisiti | ✅ | ✅ | ❌ | ✅ |
| Sandbox reale | ✅ | ✅ | ✅ | ⚠️ (directory isolata) |
| GPU access (Metal) | ✅ | ✅ | ❌ | ✅ |
| Peso installer (senza modello) | ~200 MB | ~350 MB | ~500 MB | ~180 MB |
| UX nativa | ✅ | ⚠️ | ❌ | ❌ (browser) |
| Complessità build | Alta | Media | Bassa | Bassa |
| Time to MVP | 3-4 settimane | 2-3 settimane | 1 settimana | 1 settimana |
| Cross-platform effort | Medio | Basso | Alto (GPU) | Medio |
| Auto-update | ✅ (Tauri updater) | ✅ (electron-updater) | ✅ (pull) | Manuale |

---

## Piano di Esecuzione Proposto

### Sprint 1 — Hermetic Installer MVP (1 settimana)

1. [ ] Refactor: FastAPI serve anche il frontend build in produzione
2. [ ] Script `install-macos.sh` con python-build-standalone
3. [ ] Script `launcher.sh` con lifecycle management
4. [ ] Script `download-model.py` con progress + resume + SHA256
5. [ ] Test end-to-end su macOS pulito

### Sprint 2 — Stabilizzazione (1 settimana)

6. [ ] Porte dinamiche + detection conflitti
7. [ ] Graceful shutdown (SIGTERM propagation)
8. [ ] Logging unificato in `~/.redactguard/logs/`
9. [ ] Script `uninstall.sh`
10. [ ] Documentazione utente (README installazione)

### Sprint 3 — Cross-platform (1 settimana)

11. [ ] `install-linux.sh` + test su Ubuntu
12. [ ] `install-windows.ps1` + test su Windows
13. [ ] Pre-build wheel llama-cpp-python per ogni piattaforma (o switch a llama.cpp binary)

### Sprint 4 — Tauri Shell (2 settimane)

14. [ ] Setup progetto Tauri v2
15. [ ] Sidecar management per il backend Python
16. [ ] Tray icon + stato server
17. [ ] Packaging .dmg / .AppImage / .msi
18. [ ] Notarizzazione macOS

---

## Decisioni Aperte

| # | Decisione | Impatto | Raccomandazione |
|---|---|---|---|
| 1 | llama-cpp-python vs llama.cpp binary standalone | Complessità packaging | Usare **llama.cpp binary** — elimina il problema della compilazione Python-native per ogni piattaforma |
| 2 | Modello bundled vs download al primo avvio | Dimensione distribuzione, UX primo avvio | **Download al primo avvio** — installer da ~200 MB, modello scaricato dopo con progress bar |
| 3 | Browser-based vs WebView nativo (Tauri) | UX, complessità | **Browser per MVP**, Tauri come fase 2 |
| 4 | Directory di installazione | Convenzioni OS | `~/.redactguard/` (Unix), `%LOCALAPPDATA%\RedactGuard\` (Windows) |
| 5 | Strategia di aggiornamento | Manutenibilità | MVP: manuale (`redactguard update`). Fase 2: Tauri auto-updater |

---

## Note sulla Sicurezza e Privacy

- L'installer scarica binari da fonti esterne (python-build-standalone, modello). Tutte le risorse devono essere verificate via checksum SHA256 hardcoded nello script.
- Il launcher non deve mai esporre porte al di fuori di localhost (bind esclusivo su `127.0.0.1`).
- La directory `~/.redactguard/` non deve essere world-readable (`chmod 700`).
- Il modello GGUF e la cache locale contengono potenzialmente dati derivati da documenti sensibili — la disinstallazione deve sovrascrivere la cache (`shred` o equivalente) se l'utente lo richiede.
