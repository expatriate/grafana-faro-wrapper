import { sanitizeEventUrlParams, sanitizePageUrlParams, sanitizeUrl } from './sanitizers.ts';

describe('sanitizers', () => {
  describe('sanitizeUrl', () => {
    test('replaces UUID in pathname with :id', () => {
      const input = 'https://example.com/users/550e8400-e29b-41d4-a716-446655440000/profile';
      const out = sanitizeUrl(input);
      expect(out).toBe('example.com/users/:id/profile');
    });

    test('replaces long hex segment with :id', () => {
      const input = 'https://example.com/a/abcdef1234567890abcd/details';
      const out = sanitizeUrl(input);
      expect(out).toBe('example.com/a/:id/details');
    });

    test('replaces long hex segment with :id', () => {
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

  describe('sanitizePageUrlParams', () => {
    test('sanitizes beacon.meta.page.url when present', () => {
      const beacon: any = {
        meta: { page: { url: 'https://example.com/users/1234567?x=1' } },
        other: 1,
      };
      const out = sanitizePageUrlParams(beacon);
      expect(out.meta.page.url).toBe('example.com/users/:id');
      expect(out.other).toBe(1);
    });

    test('no-op when meta.page.url is missing', () => {
      const beacon: any = { meta: {}, foo: 'bar' };
      const out = sanitizePageUrlParams(beacon);
      expect(out).toEqual(beacon);
    });
  });

  describe('sanitizeEventUrlParams', () => {
    test('sanitizes payload.attributes.name for faro.performance.resource events', () => {
      const beacon: any = {
        type: 'event',
        payload: {
          name: 'faro.performance.resource',
          attributes: { name: 'https://cdn.example.com/assets/1234567.png' },
        },
      };
      const out = sanitizeEventUrlParams(beacon);
      expect(out.payload.attributes.name).toBe('cdn.example.com/assets/:id.png');
    });

    test('does not change other events', () => {
      const beacon: any = {
        type: 'event',
        payload: {
          name: 'some.other.event',
          attributes: { name: 'https://example.com/1234567' },
        },
      };
      const out = sanitizeEventUrlParams(beacon);
      expect(out.payload.attributes.name).toBe('https://example.com/1234567');
    });

    test('no-op when not an event', () => {
      const beacon: any = {
        type: 'measurement',
        payload: { name: 'faro.performance.resource', attributes: { name: 'https://a/1' } },
      };
      const out = sanitizeEventUrlParams(beacon);
      expect(out).toEqual(beacon);
    });
  });
});
