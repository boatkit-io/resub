/**
 * ComponentDecorators.ts
 * Copyright: Microsoft 2019
 *
 * Exposes helper decorator functions for use with ReSub Components
 */

import ComponentBase from './ComponentBase';

export function CustomEqualityShouldComponentUpdate<P extends {}, S = {}>(
        comparator: (this: ComponentBase<P, S>, nextProps: Readonly<P>, nextState: Readonly<S>, nextContext: any) => boolean) {
    return function <T extends { new(props: any): ComponentBase<P, S>}>(
            constructor: T,
            context: ClassDecoratorContext<T>): T {
        if (context.kind !== 'class') {
            throw new Error('Can only use @CustomEqualityShouldComponentUpdate on classes');
        }
        constructor.prototype.shouldComponentUpdate = comparator;
        return constructor;
    };
}
