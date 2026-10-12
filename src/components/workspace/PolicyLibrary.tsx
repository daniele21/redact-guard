import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Copy, Pencil, Plus, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { useProfiles } from '../../hooks/useProfiles';
import { api } from '../../services/api';
import type { PIITypeDefinition, ProfileDetail } from '../../types';

interface Props {
  activeProfile: string;
  onChooseProfile: (name: string) => void;
  onBack: () => void;
}

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9_ ]/g, '').replace(/\s+/g, '_');

export function PolicyLibrary({ activeProfile, onChooseProfile, onBack }: Props) {
  const { profiles, customTypes, loading, error: listError, addCustomType, updateCustomType, removeCustomType } = useProfiles();
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setSelectedKey(null);
    setDetailError('');
    api.getProfileDetail(activeProfile).then(next => {
      if (alive) setDetail(next);
    }).catch(() => {
      if (alive) setDetailError('Non è stato possibile caricare le definizioni del profilo.');
    });
    return () => { alive = false; };
  }, [activeProfile]);

  const definitions = useMemo(() => {
    const originals = detail?.pii_types ?? [];
    const names = new Set(originals.map(item => item.name));
    return [...originals, ...customTypes.filter(item => !names.has(item.name))]
      .filter(item => [item.name, item.label, item.description].join(' ').toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [detail, customTypes, query]);

  const original = detail?.pii_types.find(type => type.name === selectedKey);
  const override = customTypes.find(type => type.name === selectedKey);
  const current: PIITypeDefinition | undefined = override ?? original;
  const wasOverridden = Boolean(original && override);

  const select = (key: string) => {
    setCreating(false);
    setEditing(false);
    setSaveError('');
    setNotice('');
    setSelectedKey(key);
  };

  const beginEdit = () => {
    if (!current) return;
    setCreating(false);
    setEditing(true);
    setSaveError('');
    setNotice('');
    setLabel(current.label);
    setDescription(current.description);
  };

  const beginCreate = () => {
    setSelectedKey(null);
    setEditing(true);
    setCreating(true);
    setLabel('');
    setDescription('');
    setSaveError('');
    setNotice('');
  };

  const save = async () => {
    const nextName = creating ? normalizeName(label) : selectedKey;
    if (!nextName || !description.trim()) {
      setSaveError('Inserisci un nome e una descrizione.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (creating || !override) {
        await addCustomType(nextName, description.trim());
      } else {
        await updateCustomType(nextName, nextName, description.trim());
      }
      setSelectedKey(nextName);
      setCreating(false);
      setEditing(false);
      setNotice(original ? 'Variante globale salvata; la definizione originale rimane disponibile.' : 'Definizione personalizzata salvata.');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Impossibile salvare la definizione.');
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!current || !override) return;
    if (!window.confirm('Ripristinare la definizione originale? La personalizzazione globale sarà eliminata.')) return;
    setSaving(true);
    setSaveError('');
    try {
      await removeCustomType(override.name);
      setNotice('Definizione originale ripristinata.');
      if (!original) setSelectedKey(null);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Impossibile ripristinare la definizione.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-5 py-7 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <button type="button" onClick={onBack} className="mb-4 flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
            <ArrowLeft size={16} aria-hidden="true" /> Torna ai documenti
          </button>
          <div className="mb-2 flex items-center gap-2 text-sm text-primary"><BookOpen size={17} aria-hidden="true" /> Controllo delle informazioni sensibili</div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Libreria PII</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">Parti dalle definizioni incluse, adattale in linguaggio naturale e controlla cosa viene cercato nei tuoi PDF.</p>
        </div>
        <button type="button" className="rg-primary-button flex items-center gap-2" onClick={beginCreate}><Plus size={17} aria-hidden="true" /> Nuova definizione</button>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Seleziona policy per i prossimi documenti">
        {profiles.map(profile => (
          <button key={profile.name} type="button" onClick={() => onChooseProfile(profile.name)}
            aria-pressed={activeProfile === profile.name}
            className={'rounded-full border px-4 py-2 text-sm transition-colors ' +
              (activeProfile === profile.name ? 'border-primary/50 bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:text-on-surface')}>
            {profile.display_name}{activeProfile === profile.name ? ' · attiva' : ''}
          </button>
        ))}
        {loading && <span className="text-sm text-on-surface-variant">Caricamento profili…</span>}
      </div>
      {(listError || detailError) && <div role="alert" className="rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">{listError || detailError}</div>}

      <div className="grid min-h-[560px] flex-1 gap-4 lg:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.28fr)]">
        <section className="rg-context-card min-h-0 rounded-2xl p-4">
          <label className="mb-4 flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5">
            <Search size={17} className="text-on-surface-variant" aria-hidden="true" />
            <span className="sr-only">Cerca definizioni PII</span>
            <input value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(40); }} placeholder="Cerca definizioni…" className="w-full bg-transparent text-sm outline-none placeholder:text-on-surface-variant" />
          </label>
          <p className="mb-3 px-2 text-xs text-on-surface-variant">{definitions.length} definizioni · originali conservati separatamente</p>
          <div className="max-h-[58vh] space-y-1 overflow-y-auto pr-1">
            {definitions.slice(0, visibleCount).map(item => {
              const custom = customTypes.find(type => type.name === item.name);
              const isSelected = selectedKey === item.name && !creating;
              return (
                <button type="button" key={item.name} onClick={() => select(item.name)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={'flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors ' +
                    (isSelected ? 'bg-primary/10 text-on-surface ring-1 ring-primary/30' : 'text-on-surface-variant hover:bg-surface-container-high')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-on-surface">{custom?.label ?? item.label}</span>
                    <span className="mt-1 block truncate text-xs">{custom ? 'Personalizzata · globale' : 'Predefinita · qualità non qualificata'}</span>
                  </span>
                  {custom && <Copy size={15} className="shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
            {definitions.length > visibleCount && <button type="button" onClick={() => setVisibleCount(count => count + 40)} className="mt-2 w-full rounded-xl border border-outline-variant px-4 py-3 text-sm text-primary hover:bg-surface-container-high">Mostra altre definizioni ({definitions.length - visibleCount})</button>}
            {!loading && detail && definitions.length === 0 && <div className="p-5 text-sm text-on-surface-variant">Nessuna definizione corrispondente alla ricerca.</div>}
            {!detail && !detailError && <div className="p-5 text-sm text-on-surface-variant">Caricamento definizioni…</div>}
          </div>
        </section>

        <section className="rg-context-card min-h-0 rounded-2xl p-5 md:p-7">
          {creating || editing ? (
            <div className="max-w-2xl">
              <p className="mb-2 text-xs text-primary">{creating ? 'Nuova definizione' : original ? 'Variante della definizione originale' : 'Modifica personalizzazione'}</p>
              <h2 className="mb-6 text-2xl font-semibold">{creating ? 'Cosa vuoi proteggere?' : current?.label}</h2>
              <label className="mb-2 block text-sm font-medium" htmlFor="pii-label">Nome</label>
              <input id="pii-label" value={label} onChange={event => setLabel(event.target.value)} disabled={!creating}
                className="mb-5 w-full rounded-xl border border-outline-variant bg-surface-container-low p-3 text-sm disabled:opacity-70" />
              <label className="mb-2 block text-sm font-medium" htmlFor="pii-description">Cosa deve riconoscere RedactGuard?</label>
              <textarea id="pii-description" value={description} onChange={event => setDescription(event.target.value)}
                className="min-h-[160px] w-full rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm leading-6" />
              {original && <div className="mt-4 rounded-xl bg-surface-container-low p-4">
                <p className="mb-2 text-xs font-medium text-on-surface-variant">Definizione originale · sola lettura</p>
                <p className="text-sm leading-6">{original.description}</p>
              </div>}
              <p className="mt-4 text-xs leading-5 text-on-surface-variant">Le personalizzazioni sono attualmente globali e si applicano ai profili contenenti questa chiave. La libreria ufficiale non viene sovrascritta. Il salvataggio non equivale a una validazione della qualità.</p>
              {saveError && <p role="alert" className="mt-4 text-sm text-error">{saveError}</p>}
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={save} disabled={saving} className="rg-primary-button flex items-center gap-2"><Check size={16} aria-hidden="true" /> {saving ? 'Salvataggio…' : 'Salva definizione'}</button>
                <button type="button" onClick={() => { setEditing(false); setCreating(false); setSaveError(''); }} className="rg-secondary-button">Annulla</button>
              </div>
            </div>
          ) : current ? (
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-outline-variant px-3 py-1 text-xs text-on-surface-variant">{override ? 'Variante globale' : 'Definizione predefinita'}</span>
                <span className="rounded-full border border-outline-variant px-3 py-1 text-xs text-on-surface-variant">Qualità non qualificata</span>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight">{current.label}</h2>
              <p className="mt-5 text-xs font-medium uppercase tracking-wide text-on-surface-variant">Definizione</p>
              <p className="mt-2 text-base leading-8 text-on-surface">{current.description}</p>
              {wasOverridden && <div className="mt-6 rounded-xl bg-surface-container-low p-4">
                <p className="text-xs font-medium text-on-surface-variant">Originale conservato</p><p className="mt-2 text-sm leading-6">{original?.description}</p>
              </div>}
              {current.examples.length > 0 && <div className="mt-7">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-on-surface-variant">Esempi inclusi nella definizione</p>
                <div className="flex flex-wrap gap-2">{current.examples.slice(0, 8).map((example, index) => <span key={index} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">{example}</span>)}</div>
              </div>}
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={beginEdit} className="rg-primary-button flex items-center gap-2"><Pencil size={16} aria-hidden="true" /> Personalizza</button>
                {override && <button type="button" disabled={saving} onClick={restore} className="rg-secondary-button flex items-center gap-2"><RotateCcw size={16} aria-hidden="true" /> {original ? 'Ripristina originale' : 'Elimina definizione'}</button>}
              </div>
              {notice && <p role="status" className="mt-5 text-sm text-success">{notice}</p>}
              {saveError && <p role="alert" className="mt-5 text-sm text-error">{saveError}</p>}
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 text-center">
              <ShieldCheck size={40} className="text-primary" aria-hidden="true" />
              <h2 className="text-xl font-medium">La tua policy, in chiaro.</h2>
              <p className="max-w-sm text-sm leading-6 text-on-surface-variant">Seleziona una definizione per leggerla, oppure creane una nuova. Nessuna modifica ai modelli o al codice.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
