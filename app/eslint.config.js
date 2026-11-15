// ESLint for the TypeScript and Svelte code: `npm run lint`, `make check`, and
// the pre-commit hook on staged files. Types are checked by svelte-check and tsc, not here.
import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['dist/', 'src-tauri/', 'node_modules/'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    rules: {
      // `_old`, `_args`: a leading underscore marks a value left unused on purpose, such as a
      // field dropped by destructuring or a mock's parameters.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // `{' · '}` keeps the spaces round a separator, which Svelte trims at a tag's edge.
      'svelte/no-useless-mustaches': 'off',
      // svelte-check reports the compiler's own warnings; this rule's idea of them differs.
      'svelte/no-unused-svelte-ignore': 'off',
    },
  },
  {
    // Tests feed in malformed files and partial objects on purpose.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
