import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.impeccable'] },
  {
    files: ['**/*.{ts,mjs}'],
    languageOptions: { parser: tseslint.parser },
    rules: { curly: ['error', 'all'] },
  },
);
