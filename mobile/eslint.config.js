// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  prettier,
  { ignores: ['dist/*', 'coverage/*', 'android/*', 'ios/*', '.expo/*', 'qa/*', 'node_modules/*'] },
  {
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Constraint 5: no network calls.' }],
      'no-restricted-imports': ['error', { paths: ['axios'] }],
    },
  },
]);
