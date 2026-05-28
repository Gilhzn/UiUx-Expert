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
    el.value = String(value);
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
      hideStickyBars: false,
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
  };
}

(async () => {
  const resp = await sendMessage({ type: 'getState' });
  if (resp.type !== 'state') return;
  fillForm(resp.state.uxDna);

  const form = document.getElementById('dna-form') as HTMLFormElement | null;
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = readForm();
    await sendMessage({ type: 'updateUxDna', uxDna: patch });
    const status = document.getElementById('save-status');
    if (status) {
      status.textContent = '✓ נשמר';
      setTimeout(() => {
        if (status) status.textContent = '';
      }, 1500);
    }
  });
})();
