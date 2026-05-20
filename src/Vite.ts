export interface StandardDecoratorsTransformResult {
    code: string;
    map: any;
}

export interface StandardDecoratorsVitePlugin {
    name: string;
    enforce: 'pre';
    transform(code: string, id: string): Promise<StandardDecoratorsTransformResult | null>;
}

const sourceFilePattern = /\.[cm]?[tj]sx?$/;
const standardDecoratorPattern = /^\s*@\w/m;
const nodeModulesPattern = /(?:^|[\\/])node_modules[\\/]/;

let typescriptModulePromise: Promise<typeof import('typescript')> | undefined;

function loadTypescript(): Promise<typeof import('typescript')> {
    if (!typescriptModulePromise) {
        typescriptModulePromise = import('typescript').catch(() => {
            throw new Error('ReSub standardDecorators requires typescript to be installed in the Vite project.');
        });
    }

    return typescriptModulePromise;
}

function shouldTransform(code: string, fileName: string): boolean {
    return sourceFilePattern.test(fileName) &&
        !nodeModulesPattern.test(fileName) &&
        standardDecoratorPattern.test(code);
}

export function standardDecorators(): StandardDecoratorsVitePlugin {
    return {
        name: 'standard-decorators',
        enforce: 'pre',
        async transform(code: string, id: string): Promise<StandardDecoratorsTransformResult | null> {
            const fileName = id.split('?')[0];
            if (!shouldTransform(code, fileName)) {
                return null;
            }

            const ts = await loadTypescript();
            const result = ts.transpileModule(code, {
                compilerOptions: {
                    target: ts.ScriptTarget.ES2022,
                    module: ts.ModuleKind.ESNext,
                    jsx: ts.JsxEmit.Preserve,
                    experimentalDecorators: false,
                    sourceMap: true,
                },
                fileName,
            });

            return {
                code: result.outputText,
                map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
            };
        },
    };
}
