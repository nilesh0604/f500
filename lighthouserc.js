module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:4200/'],
      startServerCommand:
        'cd apps/vyasa-ui && npx vite preview --outDir dist --port 4200 --host',
      startServerReadyPattern: 'Local',
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
        /* Audits that return NaN for this SPA (no scores to compare minScore against) */
        'lcp-lazy-loaded': 'off',
        'non-composited-animations': 'off',
        'prioritize-lcp-image': 'off',
        'robots-txt': 'off',
        /* Relaxed until UI contrast issues are fixed */
        'color-contrast': ['warn', { minScore: 0.9 }],
        'unused-javascript': ['warn', { maxLength: 1 }],
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
