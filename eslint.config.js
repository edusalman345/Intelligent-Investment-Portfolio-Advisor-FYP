import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  { ignores:['**/node_modules/**','**/dist/**','**/.venv/**','**/.tmp/**','**/coverage/**','**/test-results/**','**/playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files:['**/*.{ts,tsx,js}'],languageOptions:{globals:{...globals.node,...globals.browser}},rules:{'@typescript-eslint/no-explicit-any':'error','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_'}]} },
);
