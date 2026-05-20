import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

import resubPlugin from './eslint/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const globals = {
    __dirname: 'readonly',
    clearTimeout: 'readonly',
    console: 'readonly',
    document: 'readonly',
    globalThis: 'readonly',
    module: 'readonly',
    process: 'readonly',
    require: 'readonly',
    setTimeout: 'readonly',
    window: 'readonly',

    afterEach: 'readonly',
    beforeEach: 'readonly',
    describe: 'readonly',
    expect: 'readonly',
    it: 'readonly',
};

export default [
    {
        ignores: [
            'dist*/**',
            'examples/*/dist/**',
            'node_modules/**',
        ],
    },
    {
        files: [
            'src/**/*.{ts,tsx}',
            'test/**/*.{ts,tsx}',
        ],
        languageOptions: {
            ecmaVersion: 2018,
            globals,
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                    modules: true,
                },
                project: [
                    './tsconfig.json',
                    './tsconfig/test.json',
                ],
                sourceType: 'module',
                tsconfigRootDir: __dirname,
                warnOnUnsupportedTypeScriptVersion: false,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            resub: resubPlugin,
        },
        rules: {
            'resub/incorrect-state-access': 'error',

            'linebreak-style': [0, 'error', 'windows'],
            'jsx-quotes': ['error', 'prefer-single'],
            'arrow-body-style': 'error',
            'arrow-parens': ['error', 'as-needed'],
            'constructor-super': 'error',
            'curly': ['error', 'all'],
            'eol-last': ['error', 'always'],
            'eqeqeq': [
                'error',
                'always',
                {
                    null: 'ignore',
                },
            ],
            'for-direction': 'error',
            'getter-return': 'error',
            'guard-for-in': 'error',
            'max-len': [
                'error',
                {
                    code: 140,
                },
            ],
            'new-parens': 'error',
            'no-caller': 'error',
            'no-case-declarations': 'error',
            'no-class-assign': 'error',
            'no-compare-neg-zero': 'error',
            'no-cond-assign': 'error',
            'no-console': 'error',
            'no-const-assign': 'error',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-control-regex': 'error',
            'no-debugger': 'error',
            'no-delete-var': 'error',
            'no-dupe-args': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-duplicate-imports': 'error',
            'no-empty': 'error',
            'no-empty-character-class': 'error',
            'no-empty-pattern': 'error',
            'no-eval': 'error',
            'no-ex-assign': 'error',
            'no-extra-boolean-cast': 'error',
            'no-fallthrough': 'error',
            'no-func-assign': 'error',
            'no-global-assign': 'error',
            'no-inner-declarations': 'error',
            'no-invalid-regexp': 'error',
            'no-irregular-whitespace': 'error',
            'no-mixed-spaces-and-tabs': 'error',
            'no-multiple-empty-lines': 'error',
            'no-new-symbol': 'error',
            'no-new-wrappers': 'error',
            'no-obj-calls': 'error',
            'no-octal': 'error',
            'no-regex-spaces': 'error',
            'no-self-assign': 'error',
            'no-sparse-arrays': 'error',
            'no-sequences': 'error',
            'no-this-before-super': 'error',
            'no-throw-literal': 'error',
            'no-trailing-spaces': 'error',
            'no-unexpected-multiline': 'error',
            'no-undef-init': 'error',
            'no-unreachable': 'error',
            'no-unsafe-finally': 'error',
            'no-unsafe-negation': 'error',
            'no-unused-labels': 'error',
            'no-useless-escape': 'error',
            'no-var': 'error',
            'one-var': ['error', 'never'],
            'prefer-const': 'error',
            'radix': ['error', 'always'],
            'require-yield': 'error',
            'use-isnan': 'error',
            'valid-typeof': 'error',

            'spaced-comment': ['error', 'always'],

            '@typescript-eslint/adjacent-overload-signatures': 'error',
            '@typescript-eslint/array-type': 'error',
            '@typescript-eslint/consistent-type-assertions': [
                'error',
                {
                    assertionStyle: 'as',
                    objectLiteralTypeAssertions: 'never',
                },
            ],
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
            '@typescript-eslint/dot-notation': 'error',
            '@typescript-eslint/explicit-function-return-type': [
                'error',
                {
                    allowExpressions: true,
                },
            ],
            '@typescript-eslint/explicit-member-accessibility': [
                'error',
                {
                    accessibility: 'no-public',
                },
            ],
            '@typescript-eslint/no-array-constructor': 'error',
            '@typescript-eslint/no-dupe-class-members': 'error',
            '@typescript-eslint/no-empty-function': [
                'error',
                {
                    allow: ['arrowFunctions'],
                },
            ],
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-implied-eval': 'error',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/no-misused-new': 'error',
            '@typescript-eslint/no-namespace': 'error',
            '@typescript-eslint/no-redeclare': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/no-unused-expressions': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'none',
                    ignoreRestSiblings: true,
                },
            ],
            '@typescript-eslint/no-use-before-define': [
                'error',
                {
                    classes: false,
                    functions: false,
                },
            ],
            '@typescript-eslint/no-var-requires': 'error',
            '@typescript-eslint/prefer-namespace-keyword': 'error',
            '@typescript-eslint/triple-slash-reference': [
                'error',
                {
                    lib: 'never',
                    path: 'never',
                    types: 'never',
                },
            ],

            'comma-dangle': [
                'error',
                {
                    arrays: 'always-multiline',
                    exports: 'always-multiline',
                    functions: 'always-multiline',
                    imports: 'always-multiline',
                    objects: 'always-multiline',
                },
            ],
            'dot-notation': 'off',
            'indent': [
                'error',
                4,
                {
                    FunctionDeclaration: {
                        body: 1,
                        parameters: 2,
                    },
                    FunctionExpression: {
                        body: 1,
                        parameters: 2,
                    },
                    SwitchCase: 1,
                },
            ],
            'keyword-spacing': [
                'error',
                {
                    after: true,
                    before: true,
                    overrides: {
                        case: { after: true },
                        return: { after: true },
                        throw: { after: true },
                    },
                },
            ],
            'no-array-constructor': 'off',
            'no-dupe-class-members': 'off',
            'no-empty-function': 'off',
            'no-extra-semi': 'error',
            'no-redeclare': 'off',
            'no-unused-expressions': 'off',
            'no-unused-vars': 'off',
            'no-use-before-define': 'off',
            'quotes': [
                'error',
                'single',
                {
                    allowTemplateLiterals: true,
                },
            ],
            'semi': 'error',
            'space-before-function-paren': ['error', 'never'],
        },
    },
];
