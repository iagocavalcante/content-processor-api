module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.eslint.json',
    // Without this the project path is resolved against a lower-cased cwd on
    // macOS, and every test file is reported as outside the tsconfig.
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    // The server logs through pino; a bare console call is almost always a
    // leftover. Errors are allowed for the paths that run before the logger
    // exists, such as configuration validation.
    'no-console': ['warn', { allow: ['error', 'warn'] }],
  },
  overrides: [
    {
      // These simulate integrations that do not exist yet, and their console
      // output is the demonstration. Warning on every line trains people to
      // ignore warnings, which is worse than the console calls.
      files: ['src/workers/**/*.ts', 'src/scripts/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      files: ['tests/**/*.ts'],
      rules: {
        // Tests reach into request/response shapes that are not worth typing.
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '*.cjs'],
};
