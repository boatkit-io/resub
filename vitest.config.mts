import { transformAsync } from '@babel/core';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

function standardDecoratorsTypescript(): Plugin {
    return {
        name: 'standard-decorators-typescript',
        enforce: 'pre',
        async transform(code, id) {
            if (!/\.[cm]?[tj]sx?$/.test(id) || id.includes('/node_modules/')) {
                return null;
            }

            const isTsx = /\.[cm]?tsx$/.test(id);
            const result = await transformAsync(code, {
                babelrc: false,
                configFile: false,
                filename: id,
                plugins: [
                    ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
                    ['@babel/plugin-transform-typescript', {
                        allowDeclareFields: true,
                        allExtensions: true,
                        isTSX: isTsx,
                    }],
                    ['@babel/plugin-transform-react-jsx', { runtime: 'classic' }],
                ],
                sourceMaps: true,
            });

            return result && result.code
                ? {
                    code: result.code,
                    map: result.map,
                }
                : null;
        },
    };
}

export default defineConfig({
    plugins: [
        standardDecoratorsTypescript(),
    ],
    test: {
        environment: 'jsdom',
        fileParallelism: false,
        globals: true,
        include: [
            'test/**/*.spec.ts',
            'test/**/*.spec.tsx',
        ],
    },
});
