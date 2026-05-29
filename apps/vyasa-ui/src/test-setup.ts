import '@testing-library/jest-dom/vitest';

// scrollIntoView is not implemented in jsdom — silence the error
// eslint-disable-next-line @typescript-eslint/no-empty-function
window.HTMLElement.prototype.scrollIntoView = function (): void {};
