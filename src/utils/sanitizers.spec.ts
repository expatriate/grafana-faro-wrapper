import { sanitizeEventUrls, sanitizePageUrl, sanitizePath, sanitizeUrl } from './sanitizers';

describe('sanitizers', () => {
  describe('sanitizeUrl', () => {
    test('replaces UUID in pathname with :id', () => {
      const input = 'https://example.com/users/550e8400-e29b-41d4-a716-446655440000/profile';
      const out = sanitizeUrl(input);
      expect(out).toBe('example.com/users/:id/profile');
    });

    test('replaces UUIDs of any version, including v7, with :id', () => {
      expect(sanitizeUrl('https://a.com/orders/0190a6e2-7c3b-7d4e-9f00-1a2b3c4d5e6f')).toBe(
        'a.com/orders/:id',
      );
    });

    test('replaces a UUID followed by a hex suffix with a single :id', () => {
      expect(sanitizeUrl('https://a.com/x/550e8400-e29b-41d4-a716-446655440000abc')).toBe(
        'a.com/x/:id',
      );
    });

    test('replaces long hex segment with :id', () => {
      const input = 'https://example.com/a/abcdef1234567890abcd/details';
      const out = sanitizeUrl(input);
      expect(out).toBe('example.com/a/:id/details');
    });

    test('replaces a UUID with a long alphanumeric suffix with :id', () => {
      const input =
        'https://gc.scr.example.com/7D8B79A2-8974-4D7B-A76A-F4F29624C06BG6MNX6kL4JtpdxZ5jiaI0mN7eaEgCFoWTvXyQdZxbdDUiNG1HJQmKbln2UffnDXQhKwYxkpEXS0j4nr6b990yg/init';
      const out = sanitizeUrl(input);
      expect(out).toBe('gc.scr.example.com/:id/init');
    });

    test('replaces long numeric id with :id and strips query/hash', () => {
      const input = 'https://example.com/item/1234567?token=abc#frag';
      const out = sanitizeUrl(input);
      expect(out).toBe('example.com/item/:id');
    });

    test('preserves filename extension when numeric id inside filename', () => {
      const input = 'https://cdn.example.com/assets/1234567.png';
      const out = sanitizeUrl(input);
      expect(out).toBe('cdn.example.com/assets/:id.png');
    });

    test('returns original input for invalid URL', () => {
      const input = 'not-a-valid-url';
      expect(sanitizeUrl(input)).toBe(input);
    });
  });

  describe('sanitizePath', () => {
    test('replaces ids in a bare pathname that is not a full URL', () => {
      expect(sanitizePath('/Orders/0190a6e2-7c3b-7d4e-9f00-1a2b3c4d5e6f/items/1234567')).toBe(
        '/orders/:id/items/:id',
      );
    });
  });

  describe('sanitizePageUrl', () => {
    test('sanitizes beacon.meta.page.url when present', () => {
      const beacon: any = {
        meta: { page: { url: 'https://example.com/users/1234567?x=1' } },
        other: 1,
      };
      const out: any = sanitizePageUrl(beacon);
      expect(out.meta.page.url).toBe('example.com/users/:id');
      expect(out.other).toBe(1);
    });

    test('no-op when meta.page.url is missing', () => {
      const beacon: any = { meta: {}, foo: 'bar' };
      const out: any = sanitizePageUrl(beacon);
      expect(out).toEqual(beacon);
    });
  });

  describe('sanitizeEventUrls', () => {
    test('sanitizes the resource URL of faro.performance.resource events', () => {
      const beacon: any = {
        type: 'event',
        payload: {
          name: 'faro.performance.resource',
          attributes: { name: 'https://cdn.example.com/assets/1234567.png', duration: '12' },
        },
      };
      const out: any = sanitizeEventUrls(beacon);
      expect(out.payload.attributes).toEqual({
        name: 'cdn.example.com/assets/:id.png',
        duration: '12',
      });
    });

    test('strips query from page URLs reported by CSP violations', () => {
      const beacon: any = {
        type: 'event',
        payload: {
          name: 'securitypolicyviolation',
          attributes: {
            documentURI: 'https://a.com/orders/1234567?token=secret',
            referrer: 'https://a.com/login?email=john@example.com',
            blockedURI: 'inline',
          },
        },
      };
      expect((sanitizeEventUrls(beacon).payload as any).attributes).toEqual({
        documentURI: 'a.com/orders/:id',
        referrer: 'a.com/login',
        blockedURI: 'inline',
      });
    });

    test('strips query from navigation URLs', () => {
      const beacon: any = {
        type: 'event',
        payload: {
          name: 'faro.navigation',
          attributes: { fromUrl: 'https://a.com/?ref=mail', toUrl: 'https://a.com/magic?token=x' },
        },
      };
      expect((sanitizeEventUrls(beacon).payload as any).attributes).toEqual({
        fromUrl: 'a.com/',
        toUrl: 'a.com/magic',
      });
    });

    test('no-op for beacons that are not events', () => {
      const beacon: any = {
        type: 'measurement',
        payload: { attributes: { name: 'https://a.com/1234567' } },
      };
      expect(sanitizeEventUrls(beacon)).toBe(beacon);
    });
  });
});
