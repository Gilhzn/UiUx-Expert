import { describe, it, expect } from 'vitest';
import { routeKey, routeKeyFromUrl } from './routeKey';

describe('routeKey', () => {
  it('preserves a static path', () => {
    expect(routeKey('https://example.com', '/about/team')).toBe('https://example.com/about/team');
  });

  it('collapses numeric IDs', () => {
    expect(routeKey('https://shop.example', '/product/12345')).toBe(
      'https://shop.example/product/:id',
    );
    expect(routeKey('https://shop.example', '/user/42/orders/9001')).toBe(
      'https://shop.example/user/:id/orders/:id',
    );
  });

  it('collapses UUIDs', () => {
    expect(
      routeKey('https://app.example', '/items/550e8400-e29b-41d4-a716-446655440000'),
    ).toBe('https://app.example/items/:uuid');
  });

  it('collapses long hex hashes', () => {
    expect(routeKey('https://app.example', '/blob/abcdef0123456789')).toBe(
      'https://app.example/blob/:hash',
    );
  });

  it('treats bare origin as root', () => {
    expect(routeKey('https://example.com', '')).toBe('https://example.com/');
    expect(routeKey('https://example.com', '/')).toBe('https://example.com/');
  });

  it('routeKeyFromUrl ignores query and fragment', () => {
    expect(routeKeyFromUrl('https://example.com/product/42?ref=email#top')).toBe(
      'https://example.com/product/:id',
    );
  });

  it('routeKeyFromUrl returns empty string on invalid URL', () => {
    expect(routeKeyFromUrl('not a url')).toBe('');
  });
});
