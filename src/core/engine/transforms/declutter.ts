import type { UxDna } from '../../storage/types';
import type { CssRule } from '../cssBuilder';

const AD_SELECTORS = [
  '[id*="google_ads"]',
  '[id*="ad-container"]',
  '[class*="ad-container"]',
  '[class*="adsbygoogle"]',
  '[id*="banner-ad"]',
  '[class*="banner-ad"]',
  'ins.adsbygoogle',
  'iframe[src*="doubleclick"]',
  'iframe[src*="googlesyndication"]',
  '[aria-label*="advert" i]',
  '[aria-label*="sponsored" i]',
  '[data-ad]',
  '[data-ad-slot]',
];

const COOKIE_BANNER_SELECTORS = [
  '[class*="cookie-banner" i]',
  '[id*="cookie-banner" i]',
  '[class*="cookie-consent" i]',
  '[id*="cookie-consent" i]',
  '[class*="cookieBanner" i]',
  '[id*="onetrust" i]',
  '[id*="CybotCookiebot" i]',
  '[aria-label*="cookie" i][role="dialog"]',
];

export function declutterRules(dna: UxDna): CssRule[] {
  const rules: CssRule[] = [];
  if (dna.declutter.hideAds) {
    rules.push({ selector: AD_SELECTORS.join(','), declarations: { display: 'none' } });
  }
  if (dna.declutter.hideCookieBanners) {
    rules.push({ selector: COOKIE_BANNER_SELECTORS.join(','), declarations: { display: 'none' } });
  }
  return rules;
}

export { AD_SELECTORS, COOKIE_BANNER_SELECTORS };
