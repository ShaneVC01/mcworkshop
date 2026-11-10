import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', '.wrangler', 'src/routeTree.gen.ts', 'supabase'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Architecture rule: components never talk to Supabase or NetSuite directly.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@supabase/*'],
          message: 'Only src/data may talk to Supabase. Call a business function from src/data instead.',
        }],
      }],
    },
  },
  {
    files: [
      'src/routes/**/*.tsx',
      'src/components/ui/**/*.tsx',
      'src/components/states/index.tsx',
      'src/components/domain/job-bits.tsx',
      'src/features/mechanic/bits.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
