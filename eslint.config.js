import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'test-results/**', 'playwright-report/**', '.vitest/**', '.tkr-kit/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', URL: 'readonly',
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        indexedDB: 'readonly', crypto: 'readonly', localStorage: 'readonly',
        sessionStorage: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        fetch: 'readonly', self: 'readonly', caches: 'readonly',
        structuredClone: 'readonly', queueMicrotask: 'readonly',
        AbortController: 'readonly', DOMException: 'readonly',
      },
    },
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
);
