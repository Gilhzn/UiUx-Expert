import { describe, it, expect, beforeEach } from 'vitest';
import { skeletonize } from './skeletonizer';

beforeEach(() => {
  document.body.innerHTML = '';
});

function dom(html: string): Element {
  document.body.innerHTML = html;
  return document.body;
}

describe('skeletonizer — PII safety', () => {
  it('strips all text content from elements', () => {
    const root = dom(
      `<div><p>This text contains PII like john@example.com and phone 555-1234</p></div>`,
    );
    const json = JSON.stringify(skeletonize(root).root);
    expect(json).not.toContain('john@example.com');
    expect(json).not.toContain('555-1234');
    expect(json).not.toContain('This text');
    expect(json).not.toContain('PII');
  });

  it('strips href / src / data-* attributes', () => {
    const root = dom(
      `<div><a href="https://example.com/user/42" data-userid="12345" data-token="secretXYZ">link</a><img src="/avatars/me.png" alt="me"></div>`,
    );
    const json = JSON.stringify(skeletonize(root).root);
    expect(json).not.toContain('example.com');
    expect(json).not.toContain('12345');
    expect(json).not.toContain('secretXYZ');
    expect(json).not.toContain('avatars');
    expect(json).not.toContain('me.png');
    expect(json).not.toContain('href');
    expect(json).not.toContain('data-userid');
  });

  it('does not leak aria-label value (presence only)', () => {
    const root = dom(`<button aria-label="Delete user account permanently">x</button>`);
    const json = JSON.stringify(skeletonize(root).root);
    expect(json).not.toContain('Delete user');
    expect(json).not.toContain('account');
    // presence flag is allowed
    expect(json).toMatch(/"a":"1"/);
  });

  it('records only a length bucket, never the text itself', () => {
    const root = dom(`<p>Short.</p>`);
    const node = skeletonize(root).root.ch?.[0];
    expect(node?.s).toBe('s');
    expect(JSON.stringify(node)).not.toContain('Short');
  });

  it('skips script/style/noscript/meta/link/template tags', () => {
    const root = dom(
      `<div><script>secretApiCall("token123")</script><style>body{color:#ff00aa}</style><noscript>fallback</noscript><p>ok</p></div>`,
    );
    const json = JSON.stringify(skeletonize(root).root);
    expect(json).not.toContain('"t":"script"');
    expect(json).not.toContain('"t":"style"');
    expect(json).not.toContain('"t":"noscript"');
    expect(json).not.toContain('secretApiCall');
    expect(json).not.toContain('token123');
    expect(json).not.toContain('#ff00aa');
    expect(json).not.toContain('fallback');
  });
});

describe('skeletonizer — structure', () => {
  it('preserves tag names and roles', () => {
    const root = dom(`<main role="main"><nav role="navigation"><a href="/x">x</a></nav></main>`);
    const result = skeletonize(root);
    const main = result.root.ch?.[0];
    expect(main?.t).toBe('main');
    expect(main?.r).toBe('main');
    const nav = main?.ch?.[0];
    expect(nav?.t).toBe('nav');
    expect(nav?.r).toBe('navigation');
  });

  it('produces stable hash for identical structure with different text', () => {
    const a = skeletonize(dom(`<div><p>aaaaa</p><p>bbbbb</p></div>`));
    const b = skeletonize(dom(`<div><p>xxxxx</p><p>yyyyy</p></div>`));
    expect(a.hash).toBe(b.hash);
  });

  it('produces different hashes for different structures', () => {
    const a = skeletonize(dom(`<div><p>1</p></div>`));
    const b = skeletonize(dom(`<div><p>1</p><p>2</p></div>`));
    expect(a.hash).not.toBe(b.hash);
  });
});
