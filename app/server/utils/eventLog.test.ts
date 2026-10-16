import { describe, expect, it } from 'vitest';
import { classifyClient, deriveUpdatedBy } from './eventLog';

describe('classifyClient', () => {
  it('recognises the native iOS app', () => {
    expect(classifyClient('daybook-ios/1.0')).toBe('ios');
    expect(classifyClient('daybook-ios/1.0 CFNetwork/3826 Darwin/27.0.0')).toBe('ios');
    expect(deriveUpdatedBy('ios', true)).toBe('user_in_ios_app');
    expect(deriveUpdatedBy('ios', false)).toBe('anonymous_ios_app');
  });

  it('keeps existing classifications', () => {
    expect(classifyClient('Mozilla/5.0 (iPhone)')).toBe('browser');
    expect(classifyClient('curl/8.0')).toBe('curl');
    expect(classifyClient('SomeApp/1 CFNetwork/1 Darwin/1')).toBe('unknown');
    expect(deriveUpdatedBy('browser', true)).toBe('user_in_app');
  });
});
