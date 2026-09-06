import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['out/**', '*.vsix', 'eslint.config.mjs'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.webview.json'],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  }
);
