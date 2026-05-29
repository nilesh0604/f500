module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:4200/auth/login',
        'http://localhost:4200/auth/register',
      ],
      startServerCommand: 'npx serve dist/apps/vyasa-ui -l 4200 --no-clipboard',
      startServerReadyPattern: 'Accepting connections',
      startServerReadyTimeout: 30000,
      numberOfRuns: 3,
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.85 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 3500 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'color-contrast': 'error',
        'html-has-lang': 'error',
        'image-alt': 'error',
        label: 'error',
        'link-name': 'error',
        'button-name': 'error',
        'aria-required-attr': 'error',
        'aria-valid-attr': 'error',
        'uses-https': 'off',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
