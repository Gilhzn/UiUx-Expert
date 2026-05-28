import { sendMessage } from '../../shared/messaging';
import type { StoredState, TransformId, UxDna } from '../../core/storage/types';

const TRANSFORM_LABELS: Record<TransformId, string> = {
  typography: 'טיפוגרפיה',
  spacing: 'מרווחים',
  contrast: 'ניגודיות / Dark Mode',
  declutter: 'הסתרת פרסומות וקוקיז',
  focusMode: 'מצב ריכוז',
  motion: 'הפחת אנימציות',
};

let currentOrigin = '';
let state: StoredState | null = null;

async function getActiveTabOrigin(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function dnaTransformEnabled(dna: UxDna, id: TransformId): boolean {
  return dna[id].enabled;
}

async function refresh() {
  const resp = await sendMessage({ type: 'getState' });
  if (resp.type !== 'state') return;
  state = resp.state;
  render();
}

function render() {
  if (!state) return;

  const siteInfo = document.getElementById('site-info');
  if (siteInfo) siteInfo.textContent = currentOrigin || '(אין אתר פעיל)';

  const site = state.sites[currentOrigin];
  const dna = state.uxDna;
  const enabled = site?.enabled ?? dna.enabled;

  const enabledChk = document.getElementById('site-enabled') as HTMLInputElement | null;
  if (enabledChk) {
    enabledChk.checked = enabled;
    enabledChk.onchange = async () => {
      await sendMessage({
        type: 'updateSiteOverride',
        origin: currentOrigin,
        override: { enabled: enabledChk.checked },
      });
      void refresh();
    };
  }

  const list = document.getElementById('transforms-list');
  if (!list) return;
  list.innerHTML = '';
  for (const id of Object.keys(TRANSFORM_LABELS) as TransformId[]) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'toggle';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = site?.transforms?.[id] ?? dnaTransformEnabled(dna, id);
    chk.onchange = async () => {
      await sendMessage({
        type: 'updateSiteOverride',
        origin: currentOrigin,
        override: { transforms: { [id]: chk.checked } },
      });
      void refresh();
    };
    label.appendChild(chk);
    const span = document.createElement('span');
    span.textContent = TRANSFORM_LABELS[id];
    label.appendChild(span);
    li.appendChild(label);
    list.appendChild(li);
  }

  const openBtn = document.getElementById('open-options') as HTMLButtonElement | null;
  if (openBtn) openBtn.onclick = () => chrome.runtime.openOptionsPage();
}

(async () => {
  currentOrigin = await getActiveTabOrigin();
  await refresh();
})();
