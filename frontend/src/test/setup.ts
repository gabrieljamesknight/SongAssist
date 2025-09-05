// Global test setup for Vitest
// Extend expect with jest-dom matchers
import '@testing-library/jest-dom/vitest';

// Provide safe fallbacks for URL APIs in jsdom
if (typeof URL.createObjectURL !== 'function') {
  // @ts-ignore
  URL.createObjectURL = () => 'blob:mock-url';
}
if (typeof URL.revokeObjectURL !== 'function') {
  // @ts-ignore
  URL.revokeObjectURL = () => {};
}

// No-op scrollIntoView for jsdom
// @ts-ignore
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  // @ts-ignore
  Element.prototype.scrollIntoView = () => {};
}
