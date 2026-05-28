import { sendMessage } from '../../shared/messaging';
import type { UxDna } from '../../core/storage/types';

function getInput(name: string): HTMLInputElement | HTMLSelectElement | null {
  return document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;
}

function setField(name: string, value: unknown) {
  const el = getInput(name);
  if (!el) return;
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    el.checked = !!value;
  } else {
    el.value = String(value ?? '');
  }
}

function getChecked(name: string): boolean {
  const el = getInput(name);
  return el instanceof HTMLInputElement ? el.checked : false;
}

function getValue(name: string): string {
  const el = getInput(name);
  return el ? el.value : '';
}

function getNum(name: string): number {
  return Number(getValue(name));
}

function fillForm(dna: UxDna) {
  setField('typography.enabled', dna.typography.enabled);
  setField('typography.fontScale', dna.typography.fontScale);
  setField('typography.lineHeight', dna.typography.lineHeight);
  setField('spacing.enabled', dna.spacing.enabled);
  setField('spacing.density', dna.spacing.density);
  setField('contrast.enabled', dna.contrast.enabled);
  setField('contrast.mode', dna.contrast.mode);
  setField('contrast.boost', dna.contrast.boost);
  setField('declutter.enabled', dna.declutter.enabled);
  setField('declutter.hideAds', dna.declutter.hideAds);
  setField('declutter.hideCookieBanners', dna.declutter.hideCookieBanners);
  setField('focusMode.enabled', dna.focusMode.enabled);
  setField('focusMode.dimLevel', dna.focusMode.dimLevel);
  setField('motion.enabled', dna.motion.enabled);
  setField('motion.reduce', dna.motion.reduce);
  setField('dyslexiaFont.enabled', dna.dyslexiaFont.enabled);
  setField('blueprint.enabled', dna.blueprint.enabled);
  setField('blueprint.serverUrl', dna.blueprint.serverUrl);
  setField('blueprint.apiKey', dna.blueprint.apiKey);
  setField('sync.enabled', dna.sync.enabled);
  setField('sync.serverUrl', dna.sync.serverUrl);
  setField('sync.deviceId', dna.sync.deviceId);
  setField('autonomy.enabled', dna.autonomy.enabled);
  setField('autonomy.confidenceThreshold', dna.autonomy.confidenceThreshold);
  setField('autonomy.observationVisits', dna.autonomy.observationVisits);
}

function readForm(): Partial<UxDna> {
  const density = getValue('spacing.density') as UxDna['spacing']['density'];
  const mode = getValue('contrast.mode') as UxDna['contrast']['mode'];
  return {
    typography: {
      enabled: getChecked('typography.enabled'),
      fontScale: getNum('typography.fontScale'),
      lineHeight: getNum('typography.lineHeight'),
    },
    spacing: {
      enabled: getChecked('spacing.enabled'),
      density: density || 'normal',
    },
    contrast: {
      enabled: getChecked('contrast.enabled'),
      mode: mode || 'auto',
      boost: getNum('contrast.boost'),
    },
    declutter: {
      enabled: getChecked('declutter.enabled'),
      hideAds: getChecked('declutter.hideAds'),
      hideStickyBars: true,
      hideCookieBanners: getChecked('declutter.hideCookieBanners'),
    },
    focusMode: {
      enabled: getChecked('focusMode.enabled'),
      dimLevel: getNum('focusMode.dimLevel'),
    },
    motion: {
      enabled: getChecked('motion.enabled'),
      reduce: getChecked('motion.reduce'),
    },
    dyslexiaFont: {
      enabled: getChecked('dyslexiaFont.enabled'),
    },
    blueprint: {
      enabled: getChecked('blueprint.enabled'),
      serverUrl: getValue('blueprint.serverUrl').trim(),
      apiKey: getValue('blueprint.apiKey').trim(),
    },
    sync: {
      enabled: getChecked('sync.enabled'),
      serverUrl: getValue('sync.serverUrl').trim(),
      deviceId: getValue('sync.deviceId').trim(),
      passphraseSet: false,
    },
    autonomy: {
      enabled: getChecked('autonomy.enabled'),
      confidenceThreshold: Math.min(1, Math.max(0.5, getNum('autonomy.confidenceThreshold') || 0.7)),
      observationVisits: Math.min(10, Math.max(1, Math.round(getNum('autonomy.observationVisits') || 3))),
    },
  };
}

function setStatus(id: string, text: string, color = '#2a8a3e'): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

function setupSyncHandlers() {
  const passphrase = document.getElementById('sync-passphrase') as HTMLInputElement | null;
  const upload = document.getElementById('sync-upload') as HTMLButtonElement | null;
  const download = document.getElementById('sync-download') as HTMLButtonElement | null;

  upload?.addEventListener('click', async () => {
    if (!passphrase?.value) {
      setStatus('sync-status', 'יש להזין סיסמה', '#aa1a1a');
      return;
    }
    setStatus('sync-status', 'מעלה…', '#6a7287');
    const resp = await sendMessage({ type: 'syncUpload', passphrase: passphrase.value });
    if (resp.type === 'sync' && resp.ok) {
      setStatus('sync-status', '✓ הועלה (מוצפן)');
    } else {
      const err = resp.type === 'sync' ? resp.error ?? 'unknown' : 'unknown';
      setStatus('sync-status', `✗ ${err}`, '#aa1a1a');
    }
  });

  download?.addEventListener('click', async () => {
    if (!passphrase?.value) {
      setStatus('sync-status', 'יש להזין סיסמה', '#aa1a1a');
      return;
    }
    setStatus('sync-status', 'מוריד ומפענח…', '#6a7287');
    const resp = await sendMessage({ type: 'syncDownload', passphrase: passphrase.value });
    if (resp.type === 'sync' && resp.ok) {
      setStatus('sync-status', '✓ סונכרן מהענן');
      const stateResp = await sendMessage({ type: 'getState' });
      if (stateResp.type === 'state') fillForm(stateResp.state.uxDna);
    } else {
      const err = resp.type === 'sync' ? resp.error ?? 'unknown' : 'unknown';
      setStatus('sync-status', `✗ ${err}`, '#aa1a1a');
    }
  });
}

function setupNlHandler() {
  const input = document.getElementById('nl-input') as HTMLInputElement | null;
  const button = document.getElementById('nl-run') as HTMLButtonElement | null;
  button?.addEventListener('click', async () => {
    const text = input?.value.trim() ?? '';
    if (!text) {
      setStatus('nl-status', 'הזן פקודה', '#aa1a1a');
      return;
    }
    setStatus('nl-status', 'מפעיל…', '#6a7287');
    const resp = await sendMessage({ type: 'runNlCommand', text });
    if (resp.type === 'nl') {
      if (resp.unrecognized) {
        setStatus('nl-status', '✗ לא זוהתה פקודה', '#aa1a1a');
      } else {
        setStatus('nl-status', `✓ הוחל: ${resp.matched.join(', ')}`);
        if (resp.state) fillForm(resp.state.uxDna);
      }
    } else {
      setStatus('nl-status', '✗ שגיאה', '#aa1a1a');
    }
  });
}

(async () => {
  const resp = await sendMessage({ type: 'getState' });
  if (resp.type !== 'state') return;
  fillForm(resp.state.uxDna);

  const form = document.getElementById('dna-form') as HTMLFormElement | null;
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const patch = readForm();
      await sendMessage({ type: 'updateUxDna', uxDna: patch });
      setStatus('save-status', '✓ נשמר');
      setTimeout(() => setStatus('save-status', ''), 1500);
    });
  }

  setupSyncHandlers();
  setupNlHandler();
})();
