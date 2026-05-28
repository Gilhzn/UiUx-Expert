import { sendMessage } from '../../shared/messaging';
import type { StoredState, TransformId, UxDna, CustomRule } from '../../core/storage/types';
import type { Suggestion } from '../../core/heatmap/types';
import { describeAnchor } from '../../core/heatmap/suggestions';
import type { ApplyStatus, ApplyChange } from '../../core/applyStatus/applyStatus';

const TRANSFORM_LABELS: Record<TransformId, string> = {
  typography: 'טיפוגרפיה',
  spacing: 'מרווחים',
  contrast: 'ניגודיות / Dark Mode',
  declutter: 'הסתרת פרסומות וקוקיז',
  focusMode: 'מצב ריכוז',
  motion: 'הפחת אנימציות',
  dyslexiaFont: 'פונט ידידותי לדיסלקסיה',
};

const CHANGE_LABELS: Record<ApplyChange['kind'], string> = {
  tier0: 'טרנספורמציה',
  'custom-rule': 'כלל מותאם',
  'sticky-bar': 'הסתרת sticky',
  'blueprint-hide': 'Blueprint — הסתרה',
  'blueprint-reorder': 'Blueprint — סידור מחדש',
};

let currentOrigin = '';
let currentUrl = '';
let state: StoredState | null = null;
let suggestions: Suggestion[] = [];
let applyStatus: ApplyStatus | null = null;

async function getActiveTab(): Promise<{ origin: string; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  if (!url) return { origin: '', url: '' };
  try {
    return { origin: new URL(url).origin, url };
  } catch {
    return { origin: '', url: '' };
  }
}

function dnaTransformEnabled(dna: UxDna, id: TransformId): boolean {
  return dna[id].enabled;
}

async function refreshState() {
  const resp = await sendMessage({ type: 'getState' });
  if (resp.type === 'state') state = resp.state;
}

async function refreshSuggestions() {
  if (!currentUrl) {
    suggestions = [];
    return;
  }
  const resp = await sendMessage({ type: 'getSuggestions', url: currentUrl });
  suggestions = resp.type === 'suggestions' ? resp.suggestions : [];
}

async function refreshApplyStatus() {
  if (!currentOrigin) {
    applyStatus = null;
    return;
  }
  const resp = await sendMessage({ type: 'getApplyStatus', origin: currentOrigin });
  applyStatus = resp.type === 'applyStatus' ? resp.status : null;
}

async function refresh() {
  await Promise.all([refreshState(), refreshSuggestions(), refreshApplyStatus()]);
  render();
}

function render() {
  if (!state) return;
  renderHeader();
  renderSiteToggle();
  renderTransforms();
  renderSuggestions();
  renderCustomRules();
  renderApplyStatus();
  renderOptionsButton();
}

function renderHeader() {
  const siteInfo = document.getElementById('site-info');
  if (siteInfo) siteInfo.textContent = currentOrigin || '(אין אתר פעיל)';
}

function renderSiteToggle() {
  if (!state) return;
  const site = state.sites[currentOrigin];
  const enabled = site?.enabled ?? state.uxDna.enabled;
  const enabledChk = document.getElementById('site-enabled') as HTMLInputElement | null;
  if (!enabledChk) return;
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

function renderTransforms() {
  if (!state) return;
  const list = document.getElementById('transforms-list');
  if (!list) return;
  list.innerHTML = '';
  const site = state.sites[currentOrigin];
  const dna = state.uxDna;
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
}

function renderSuggestions() {
  const section = document.getElementById('suggestions-section');
  const list = document.getElementById('suggestions-list');
  if (!section || !list) return;
  list.innerHTML = '';
  if (suggestions.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  for (const s of suggestions) {
    const card = document.createElement('div');
    card.className = 'suggestion';

    const desc = document.createElement('div');
    desc.className = 'suggestion-desc';
    desc.textContent = describeAnchor(s.anchor);
    card.appendChild(desc);

    const reason = document.createElement('div');
    reason.className = 'suggestion-reason';
    reason.textContent = s.reason;
    card.appendChild(reason);

    const actions = document.createElement('div');
    actions.className = 'suggestion-actions';

    const accept = document.createElement('button');
    accept.className = 'primary';
    accept.textContent = 'הסתר אותה';
    accept.onclick = async () => {
      await sendMessage({
        type: 'applySuggestion',
        origin: currentOrigin,
        suggestionId: s.id,
        anchor: s.anchor,
      });
      void refresh();
    };
    actions.appendChild(accept);

    const dismiss = document.createElement('button');
    dismiss.className = 'secondary';
    dismiss.textContent = 'התעלם';
    dismiss.onclick = async () => {
      await sendMessage({
        type: 'dismissSuggestion',
        origin: currentOrigin,
        suggestionId: s.id,
      });
      void refresh();
    };
    actions.appendChild(dismiss);

    card.appendChild(actions);
    list.appendChild(card);
  }
}

function renderCustomRules() {
  const section = document.getElementById('custom-rules-section');
  const list = document.getElementById('custom-rules-list');
  if (!section || !list || !state) return;
  list.innerHTML = '';
  const rules: CustomRule[] = state.sites[currentOrigin]?.customRules ?? [];
  if (rules.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  for (const rule of rules) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${describeAnchor(rule.anchor)} — מוסתר`;
    li.appendChild(span);
    const btn = document.createElement('button');
    btn.className = 'small';
    btn.textContent = 'הסר';
    btn.onclick = async () => {
      await sendMessage({
        type: 'removeCustomRule',
        origin: currentOrigin,
        ruleId: rule.id,
      });
      void refresh();
    };
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function renderApplyStatus() {
  const section = document.getElementById('apply-status-section');
  const list = document.getElementById('apply-status-list');
  const issues = document.getElementById('apply-status-issues');
  if (!section || !list || !issues) return;
  list.innerHTML = '';
  issues.innerHTML = '';
  issues.hidden = true;

  if (!applyStatus || applyStatus.changes.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  for (const change of applyStatus.changes) {
    const li = document.createElement('li');
    const kindLabel = document.createElement('span');
    kindLabel.className = 'change-kind';
    kindLabel.textContent = CHANGE_LABELS[change.kind];
    li.appendChild(kindLabel);
    const label = document.createElement('span');
    label.className = 'change-label';
    label.textContent = ` ${change.label}`;
    li.appendChild(label);
    list.appendChild(li);
  }

  if (applyStatus.verifierIssues.length > 0) {
    issues.hidden = false;
    issues.textContent = 'Verifier ביטל: ' + applyStatus.verifierIssues.join(' · ');
  }
}

function renderOptionsButton() {
  const openBtn = document.getElementById('open-options') as HTMLButtonElement | null;
  if (openBtn) openBtn.onclick = () => chrome.runtime.openOptionsPage();
}

(async () => {
  const tab = await getActiveTab();
  currentOrigin = tab.origin;
  currentUrl = tab.url;
  await refresh();
})();
