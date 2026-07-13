// ESLint 9+ flat config for the NestJS backend.
//
// Pragmatic, behaviour-preserving ruleset: the goal is a clean `npm run lint`
// over the existing codebase, not enforcing a new style. Type-aware rules are
// intentionally NOT enabled (no `parserOptions.project`) so linting stays
// fast and doesn't require every linted file to be part of tsconfig.json's
// program (e.g. one-shot scripts under scripts/).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // The codebase leans on `any` at integration boundaries (Prisma JSON
      // columns, third-party SDK responses, dynamic node/config shapes) —
      // enforcing this rule would require broad refactors, not a lint pass.
      '@typescript-eslint/no-explicit-any': 'off',
      // Unused args prefixed with `_` are an intentional "ignored parameter"
      // convention (e.g. interface implementations that don't need every arg).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-empty': 'off',
      'no-constant-condition': 'off',
      'no-case-declarations': 'off',
      'no-useless-escape': 'off',
      'no-cond-assign': 'off',
      // `let` + reassignment-in-one-branch-only patterns are common in this
      // codebase's parse/normalise helpers; both rules would otherwise flag
      // pre-existing, intentional code rather than real dead-store bugs.
      'no-useless-assignment': 'off',
      'prefer-const': 'off',
    },
  },
)
