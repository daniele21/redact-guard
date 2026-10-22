import { useState } from 'react';
import { ArrowLeft, Database, HardDrive, LockKeyhole, RotateCcw, ShieldCheck, Trash2, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { api } from '../../services/api';

interface Props { onBack: () => void; notice: string; onNotice: (value: string) => void; }

export function PrivacyPanel({ onBack, notice, onNotice }: Props) {
  const [busy, setBusy] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const clear = async () => {
    if (!window.confirm('Eliminare tutte le cache locali di conversione e inferenza? I modelli gestiti da Korgis e le definizioni PII non verranno eliminati.')) return;
    setBusy(true);
    onNotice('');
    try {
      await api.clearCache();
      onNotice('Cache locale eliminata.');
    } catch {
      onNotice('Impossibile eliminare la cache. Verifica che il backend locale sia raggiungibile.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 lg:px-12">
      <button type="button" onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface"><ArrowLeft size={16} aria-hidden="true" /> Torna ai documenti</button>
      <div className="mb-4 flex items-center gap-3 text-success"><ShieldCheck size={23} aria-hidden="true" /><span className="text-sm">Privacy e controllo locale</span></div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">I tuoi dati, sotto il tuo controllo.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-on-surface-variant">RedactGuard elabora documenti e inferenza sul dispositivo. Qui puoi distinguere informazioni temporanee, cache locali e configurazioni persistenti.</p>
      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        <section className="rg-context-card rounded-2xl p-6">
          <LockKeyhole size={25} className="mb-5 text-success" aria-hidden="true" />
          <h2 className="text-lg font-medium">Documenti nella sessione</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">I documenti vengono trattati dal backend locale. Le sessioni in memoria scadono automaticamente; riaprire l'app non equivale a riprendere una sessione precedente.</p>
        </section>
        <section className="rg-context-card rounded-2xl p-6">
          <HardDrive size={25} className="mb-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-medium">Definizioni PII</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">Le personalizzazioni vengono salvate sul dispositivo e applicate alle successive analisi. La modifica della policy non elimina automaticamente le cache precedenti, ma ne modifica la chiave di riutilizzo.</p>
        </section>
      </div>
      <section className="rg-context-card mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
        <div className="flex items-center gap-3">
          {theme === 'dark' ? <Moon size={20} className="text-primary" aria-hidden="true" /> : <Sun size={20} className="text-primary" aria-hidden="true" />}
          <div><h2 className="text-lg font-medium">Aspetto</h2><p className="mt-1 text-sm text-on-surface-variant">Tema {theme === 'dark' ? 'scuro' : 'chiaro'}</p></div>
        </div>
        <button type="button" className="rg-secondary-button" onClick={toggleTheme}>Passa al tema {theme === 'dark' ? 'chiaro' : 'scuro'}</button>
      </section>
      <section className="rg-context-card mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
        <div className="max-w-xl">
          <div className="mb-2 flex items-center gap-2"><Database size={19} className="text-primary" aria-hidden="true" /><h2 className="text-lg font-medium">Cache di elaborazione</h2></div>
          <p className="text-sm leading-6 text-on-surface-variant">La cache può contenere testo estratto o risultati intermedi sensibili. Eliminala quando non serve conservarla. Questa operazione non cancella eventuali file esportati né i modelli di Korgis.</p>
        </div>
        <button type="button" onClick={clear} disabled={busy} className="rg-secondary-button flex items-center gap-2"><Trash2 size={16} aria-hidden="true" /> {busy ? 'Cancellazione…' : 'Elimina cache'}</button>
      </section>
      {notice && <p role="status" className="mt-4 rounded-xl border border-outline-variant p-4 text-sm">{notice}</p>}
      <p className="mt-8 flex items-start gap-2 text-xs leading-6 text-on-surface-variant"><RotateCcw size={15} className="mt-1 shrink-0" aria-hidden="true" /> Il recupero e la cancellazione dei file esportati dipendono dalla cartella scelta dall'utente. Nessuna certificazione di anonimizzazione viene implicata dalla sola esecuzione locale.</p>
    </main>
  );
}
