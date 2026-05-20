import { standardDecorators } from '../src/Vite';

const decoratedClass = `
function logged<This, Args extends unknown[], Return>(
        value: (this: This, ...args: Args) => Return,
        _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>) {
    return value;
}

class Example {
    @logged
    method(): string {
        return 'ok';
    }
}
`;

describe('standardDecorators', () => {
    it('transforms standard decorators in TypeScript files', async() => {
        const plugin = standardDecorators();
        const result = await plugin.transform(decoratedClass, '/src/Example.ts');

        expect(result).not.toBeNull();
        expect(result!.code).toContain('__esDecorate');
        expect(result!.map).toBeTruthy();
    });

    it('skips files without decorators', async() => {
        const plugin = standardDecorators();

        expect(await plugin.transform('class Example {}', '/src/Example.ts')).toBeNull();
    });

    it('skips node_modules files', async() => {
        const plugin = standardDecorators();

        expect(await plugin.transform(decoratedClass, '/node_modules/package/Example.ts')).toBeNull();
    });
});
