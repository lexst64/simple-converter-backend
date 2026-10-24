import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginPrettier from 'eslint-plugin-prettier';
import configPrettier from 'eslint-config-prettier';
import unusedImports from "eslint-plugin-unused-imports";

export default [
  {
    ignores: ['dist', 'node_modules', '_outputs', '_uploads'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier: pluginPrettier,
      'unused-imports': unusedImports,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...configPrettier.rules,
      'prettier/prettier': 'error',
      'unused-imports/no-unused-imports': 'error',
    },
  },
  {
    // Tool config outside src/ (and therefore outside tsconfig.json): lint without type info.
    files: ['vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
  },
];
