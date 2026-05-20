/**
* AutoSubscriptions.ts
* Author: Mark Davis
* Copyright: Microsoft 2016
*
* Method decorator for stores implementations, to help components auto-subscribe when they use certain methods.
*
* When an @autoSubscribe method is called, the most recent @enableAutoSubscribe method up the call stack will trigger its handler.
* When an @warnIfAutoSubscribeEnabled method is called, it will warn if the most recent @enableAutoSubscribe was in a component.
*/

// -- Decorator info --
//
// ReSub uses standard decorators as implemented by TypeScript 5+. Method decorators receive the method and a context object, and can
// return a replacement method. Class decorators receive the constructor and a context object.
//
// * Class decorators are given the Target (class constructor).
//   @AutoSubscribeStore only runs some code, without changing the constructor.
//
// * Method decorators are given the method function and context for the method.
//   @enableAutoSubscribe and @autoSubscribe wrap the method so custom logic can run every time the method is called.
//   @warnIfAutoSubscribeEnabled does nothing in production. For devs, it wraps the method similar to the others.
//
// * Standard decorators do not support parameter decorators. @key is now a method decorator factory. Use @key(0), @key(0, 1), etc.
//
// Note: TypeScript allows an arbitrary expression after the @, so long as it resolves to a function with the correct signature. Thus
// using `@makeAutoSubscribeDecorator(false)` would be valid: the `makeAutoSubscribeDecorator(false)` would be evaluated to get the
// decorator, and then the decorator would be called with the parameters described above.
//
// Note: TypeScript does not automatically apply decorators to child classes. If they want the decorator then they need to add it as well.
// For example, applying the @forbidAutoSubscribe decorator (does not actually exist) on ComponentBase.render could change the method on
// the prototype, but the child's render would be a different method. That would be completely useless: even if you call super.render,
// the decorator's logic only applies until the end of that method, not the end of yours. This is why that functionality is exposed as a
// function instead of a decorator.

import { useEffect, useState } from 'react';

import Options from './Options';
import { KeyOrKeys, assert, formCompoundKey, isFunction, isNumber, isString, normalizeKeys } from './utils';
import { StoreBase } from './StoreBase';

interface Metadata {
    __decorated?: boolean;
}

// Class prototype for decorated methods.
type InstanceTargetWithMetadata = InstanceTarget & {
    // Extra property shoved onto targets to hold auto-subscribe metadata.
    __resubMetadata: Metadata;
};

export interface InstanceTarget {
    [propertyName: string]: any;
}

type ResubMethod<This = any, Args extends any[] = any[], Return = any> = (this: This, ...args: Args) => Return;

type ResubMethodDecorator = <This, Args extends any[], Return>(
    existingMethod: ResubMethod<This, Args, Return>,
    context: ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>
) => ResubMethod<This, Args, Return> | void;

const methodMetadataKey = Symbol('resubMethodMetadata');

interface MethodMetadata {
    hasAutoSubscribeDecorator?: boolean;
    keyIndexes?: number[];
}

interface MethodWithMetadata extends Function {
    [methodMetadataKey]?: MethodMetadata;
}

interface ResubClassConstructor {
    new(...args: any[]): InstanceTarget;
    prototype: InstanceTarget;
}

export interface AutoSubscribeOptions {
    keyArgs?: number | number[];
}

// Callback and info for setting up auto-subscriptions.
export interface AutoSubscribeHandler {
    handle(instance: InstanceTarget, store: StoreBase, key: string): void;
}

const enum AutoOptions {
    None,
    Enabled,
    Forbid
}

// Holds the handler and info for using it.
interface HandlerWraper {
    handler: AutoSubscribeHandler | undefined;
    instance: InstanceTarget;

    useAutoSubscriptions: AutoOptions;
    inAutoSubscribe: boolean;
}

// The current handler info, or null if no handler is setup.
let handlerWrapper: HandlerWraper | undefined;

function cloneMethodMetadata(metadata: MethodMetadata): MethodMetadata {
    return {
        hasAutoSubscribeDecorator: metadata.hasAutoSubscribeDecorator,
        keyIndexes: metadata.keyIndexes ? metadata.keyIndexes.slice() : undefined,
    };
}

function getMethodMetadata(method: Function): MethodMetadata | undefined {
    return (method as MethodWithMetadata)[methodMetadataKey];
}

function getOrCreateMethodMetadata(method: Function): MethodMetadata {
    let metadata = getMethodMetadata(method);
    if (!metadata) {
        metadata = {};
        (method as MethodWithMetadata)[methodMetadataKey] = metadata;
    }

    return metadata;
}

function copyMethodMetadata<T extends Function>(source: Function, destination: T): T {
    const metadata = getMethodMetadata(source);
    if (metadata) {
        (destination as MethodWithMetadata)[methodMetadataKey] = cloneMethodMetadata(metadata);
    }

    return destination;
}

function markAutoSubscribeDecorator<T extends Function>(method: T): T {
    getOrCreateMethodMetadata(method).hasAutoSubscribeDecorator = true;
    return method;
}

function hasAutoSubscribeDecorator(method: Function): boolean {
    const metadata = getMethodMetadata(method);
    return !!metadata && !!metadata.hasAutoSubscribeDecorator;
}

function appendKeyIndexes(method: Function, keyIndexes: number[]): void {
    const metadata = getOrCreateMethodMetadata(method);
    metadata.keyIndexes = keyIndexes.concat(metadata.keyIndexes || []);
}

function getKeyIndexes(method: Function): number[] | undefined {
    const metadata = getMethodMetadata(method);
    return metadata && metadata.keyIndexes;
}

function normalizeKeyIndexes(keyArgs: number | number[] | undefined): number[] | undefined {
    if (keyArgs === undefined) {
        return undefined;
    }

    const normalized = Array.isArray(keyArgs) ? keyArgs.slice() : [keyArgs];
    assert(normalized.length > 0, 'Must specify at least one argument index when using @key');

    for (const index of normalized) {
        assert(isNumber(index) && isFinite(index) && Math.floor(index) === index && index >= 0,
            `@key argument indexes must be non-negative integers: ${ JSON.stringify(index) }`);
    }

    return normalized;
}

function assertMethodContext(context: ClassMethodDecoratorContext<any, ResubMethod>, decoratorName: string): void {
    assert(context.kind === 'method', `Can only use @${ decoratorName } on methods`);
    assert(!context.static, `Can only use @${ decoratorName } on instance methods`);
}

function assertAutoSubscribeStoreDecorated(instance: any, methodName: string): void {
    let prototype = instance ? Object.getPrototypeOf(instance) as InstanceTargetWithMetadata | undefined : undefined;

    while (prototype) {
        if (prototype.__resubMetadata && prototype.__resubMetadata.__decorated) {
            return;
        }

        prototype = Object.getPrototypeOf(prototype) as InstanceTargetWithMetadata | undefined;
    }

    assert(false, `Missing @AutoSubscribeStore class decorator: "${ methodName }"`);
}

function createAutoSubscribeWrapper<T extends Function>(handler: AutoSubscribeHandler | undefined, useAutoSubscriptions: AutoOptions,
        existingMethod: T, thisArg: any): T {
    // Note: we need to be given 'this', so cannot use '=>' syntax.
    // Note: T might have other properties (e.g. T = { (): void; bar: number; }). We don't support that and need a cast.
    return function AutoSubscribeWrapper(this: any, ...args: any[]) {
        // Decorators are given 'this', but normal callers can supply it as a parameter.
        const instance = thisArg || this;

        // The handler will now be given all auto-subscribe callbacks.
        const previousHandlerWrapper = handlerWrapper;
        handlerWrapper = {
            handler: handler,
            instance: instance,
            useAutoSubscriptions: useAutoSubscriptions,
            inAutoSubscribe: false,
        };

        const result = _tryFinally(() => existingMethod.apply(instance, args),
            () => {
                // Restore the previous handler.
                handlerWrapper = previousHandlerWrapper;
            });

        return result;
    } as any as T;
}

// Returns a new function with auto-subscriptions enabled.
export function enableAutoSubscribeWrapper<T extends Function>(handler: AutoSubscribeHandler, existingMethod: T, thisArg: any): T {
    return createAutoSubscribeWrapper(handler, AutoOptions.Enabled, existingMethod, thisArg);
}

// Returns a new function that warns if any auto-subscriptions would have been encountered.
export function forbidAutoSubscribeWrapper<T extends any[], R>(existingMethod: (...args: T) => R, thisArg?: any): (...args: T) => R {
    if (!Options.development) {
        return thisArg ? existingMethod.bind(thisArg) : existingMethod;
    }
    return createAutoSubscribeWrapper(undefined, AutoOptions.Forbid, existingMethod, thisArg);
}

// Hooks up the handler for @autoSubscribe methods called later down the call stack.
export function enableAutoSubscribe(handler: AutoSubscribeHandler): ResubMethodDecorator {
    return <This, Args extends any[], Return>(
        existingMethod: ResubMethod<This, Args, Return>,
        context: ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>) => {
        assertMethodContext(context, 'enableAutoSubscribe');
        assert(isFunction(existingMethod), 'Can only use @enableAutoSubscribe on methods');

        return enableAutoSubscribeWrapper(handler, existingMethod, undefined);
    };
}

// Wraps try/finally since those are not optimized.
function _tryFinally<TResult>(tryFunc: () => TResult, finallyFunc: Function): TResult {
    try {
        return tryFunc();
    } finally {
        finallyFunc();
    }
}

function instanceTargetToInstanceTargetWithMetadata(instanceTarget: InstanceTarget): InstanceTargetWithMetadata {
    // Upcast here and make sure property exists
    const newTarget = instanceTarget as InstanceTargetWithMetadata;
    newTarget.__resubMetadata = newTarget.__resubMetadata || {};
    return newTarget;
}

export function AutoSubscribeStore<TClass extends ResubClassConstructor>(
        constructor: TClass,
        context: ClassDecoratorContext<TClass>): TClass {
    assert(context.kind === 'class', 'Can only use @AutoSubscribeStore on classes');

    const target = instanceTargetToInstanceTargetWithMetadata(constructor.prototype);
    target.__resubMetadata.__decorated = true;

    if (Options.development) {
        // Add warning for non-decorated methods.
        for (const property of Object.getOwnPropertyNames(target)) {
            if (property === 'constructor') {
                continue;
            }

            const descriptor = Object.getOwnPropertyDescriptor(target, property);
            if (!descriptor || !isFunction(descriptor.value) || hasAutoSubscribeDecorator(descriptor.value)) {
                continue;
            }

            Object.defineProperty(target, property, {
                ...descriptor,
                value: createWarnIfAutoSubscribeEnabledMethod(descriptor.value, property),
            });
        }
    }

    return constructor;
}

function getKeyParamValues(methodName: string, keyIndexes: number[] | undefined, args: any[]): string[] {
    if (!keyIndexes) {
        return [];
    }

    return keyIndexes.map(index => {
        let keyArg = args[index];

        if (isNumber(keyArg)) {
            keyArg = keyArg.toString();
        }

        assert(keyArg, `@key argument must be given a non-empty string or number: ` +
            `"${ methodName }" argument ${ index } was given ${ JSON.stringify(keyArg) }`);

        assert(isString(keyArg), `@key argument must be given a string or number: "${ methodName }" argument ${ index }`);

        return keyArg;
    });
}

// Triggers the handler of the most recent @enableAutoSubscribe method called up the call stack.
function makeAutoSubscribeDecorator(shallow = false, autoSubscribeKeys?: string[], keyIndexes?: number[]): ResubMethodDecorator {
    return <This, Args extends any[], Return>(
        existingMethod: ResubMethod<This, Args, Return>,
        context: ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>) => {
        assertMethodContext(context, 'autoSubscribe');
        assert(isFunction(existingMethod), 'Can only use @autoSubscribe on methods');

        const methodNameString = String(context.name);

        // Note: we need to be given 'this', so cannot use '=>' syntax.
        const replacementMethod = function AutoSubscribe(this: This, ...args: Args): Return {
            assertAutoSubscribeStoreDecorated(this, methodNameString);

            if (Options.development) {
                // This is a check to see if we're in a rendering function component function. If you are, then calling useState will
                // noop. If you aren't, then useState will throw an exception. So, we want to make sure that either you're inside render
                // and have the call going through a wrapped component, or that you're not inside render, and hence calling the getter
                // from a store or service or other random non-lifecycled instance, so it's on you to figure out how to manage
                // subscriptions in that instance.
                let inRender = false;
                try {
                    useState();
                    inRender = true;
                } catch {
                    // I guess we weren't in render.
                }

                assert(!inRender || !!handlerWrapper, 'Autosubscribe method called from inside a render function ' +
                    'or function component without using withResubAutoSubscriptions');
            }

            // Just call the method if no handler is setup.
            const scopedHandleWrapper = handlerWrapper;
            if (!scopedHandleWrapper || scopedHandleWrapper.useAutoSubscriptions === AutoOptions.None) {
                return existingMethod.apply(this, args);
            }

            // If this is forbidding auto-subscribe then do not go through the auto-subscribe path below.
            if (scopedHandleWrapper.useAutoSubscriptions === AutoOptions.Forbid) {
                assert(false, `Only Store methods WITHOUT the ` +
                    `@autoSubscribe decorator can be called right now (e.g. in render): "${ methodNameString }"`);

                return existingMethod.apply(this, args);
            }

            const keyParamValues = getKeyParamValues(methodNameString, getKeyIndexes(replacementMethod), args);

            // Form a list of keys to trigger.
            // If we have @key values, put them first, then append the @autoSubscribeWithKey key to the end.
            // If there are multiple keys in the @autoSubscribeWithKey list, go through each one and do the
            // same thing (@key then value). If there's neither @key nor @autoSubscribeWithKey, it's Key_All.
            const specificKeyValues: string[] = (autoSubscribeKeys && autoSubscribeKeys.length > 0) ?
                autoSubscribeKeys.map(autoSubKey => formCompoundKey(...keyParamValues.concat(autoSubKey))) :
                [(keyParamValues.length > 0) ? formCompoundKey(...keyParamValues) : StoreBase.Key_All];

            // Let the handler know about this auto-subscriptions, then proceed to the existing method.
            let wasInAutoSubscribe = false;
            const result = _tryFinally(() => {
                // Disable further auto-subscriptions if shallow.
                scopedHandleWrapper.useAutoSubscriptions = shallow ? AutoOptions.None : AutoOptions.Enabled;
                // Any further @warnIfAutoSubscribeEnabled methods are safe.
                wasInAutoSubscribe = scopedHandleWrapper.inAutoSubscribe;
                scopedHandleWrapper.inAutoSubscribe = true;

                // Let the handler know about this auto-subscription.
                const scopedHandler = scopedHandleWrapper.handler;
                if (!scopedHandler) {
                    throw new Error('[resub] Missing auto-subscribe handler');
                }
                for (const specificKeyValue of specificKeyValues) {
                    scopedHandler
                        .handle
                        .apply(scopedHandleWrapper.instance, [scopedHandleWrapper.instance, this as any, specificKeyValue]);
                }

                return existingMethod.apply(this, args);
            }, () => {
                // Must have been previously enabled to reach here.
                scopedHandleWrapper.useAutoSubscriptions = AutoOptions.Enabled;
                scopedHandleWrapper.inAutoSubscribe = wasInAutoSubscribe;
            });

            return result;
        };

        copyMethodMetadata(existingMethod, replacementMethod);
        if (keyIndexes) {
            appendKeyIndexes(replacementMethod, keyIndexes);
        }

        return markAutoSubscribeDecorator(replacementMethod);
    };
}

export function autoSubscribe<This, Args extends any[], Return>(
    existingMethod: ResubMethod<This, Args, Return>,
    context: ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>
): ResubMethod<This, Args, Return> | void;
export function autoSubscribe(options: AutoSubscribeOptions): ResubMethodDecorator;
export function autoSubscribe<This, Args extends any[], Return>(
        first: ResubMethod<This, Args, Return> | AutoSubscribeOptions,
        context?: ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>,
): ResubMethod<This, Args, Return> | ResubMethodDecorator | void {
    if (isFunction(first)) {
        assert(context, 'Missing decorator context for @autoSubscribe');
        return makeAutoSubscribeDecorator(true)(first, context as ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>);
    }

    return makeAutoSubscribeDecorator(true, undefined, normalizeKeyIndexes(first.keyArgs));
}

export function autoSubscribeWithKey(keyOrKeys: KeyOrKeys, options?: AutoSubscribeOptions): ResubMethodDecorator {
    assert(keyOrKeys || isNumber(keyOrKeys), 'Must specify a key when using autoSubscribeWithKey');
    return makeAutoSubscribeDecorator(true, normalizeKeys(keyOrKeys), normalizeKeyIndexes(options ? options.keyArgs : undefined));
}

// Records which arguments of an @autoSubscribe method are used for the subscription key.
export function key(...keyArgIndexes: number[]): ResubMethodDecorator {
    const normalizedKeyIndexes = normalizeKeyIndexes(keyArgIndexes);
    return <This, Args extends any[], Return>(
        existingMethod: ResubMethod<This, Args, Return>,
        context: ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>) => {
        assertMethodContext(context, 'key');
        appendKeyIndexes(existingMethod, normalizedKeyIndexes || []);
        return existingMethod;
    };
}

export function disableWarnings<This, Args extends any[], Return>(
        existingMethod: ResubMethod<This, Args, Return>,
        context: ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>,
): ResubMethod<This, Args, Return> {
    assertMethodContext(context, 'disableWarnings');

    // Record that the target is decorated.
    markAutoSubscribeDecorator(existingMethod);

    if (!Options.development) {
        // Warnings are already disabled for production.
        return existingMethod;
    }

    const methodName = String(context.name);

    // Note: we need to be given 'this', so cannot use '=>' syntax.
    const replacementMethod = function DisableWarnings(this: This, ...args: Args): Return {
        assertAutoSubscribeStoreDecorated(this, methodName);

        // Just call the method if no handler is setup.
        const scopedHandleWrapper = handlerWrapper;
        if (!scopedHandleWrapper || scopedHandleWrapper.useAutoSubscriptions === AutoOptions.None) {
            return existingMethod.apply(this, args);
        }

        let wasInAutoSubscribe = false;
        let wasUseAutoSubscriptions = AutoOptions.None;
        const result = _tryFinally(() => {
            // Any further @warnIfAutoSubscribeEnabled methods are safe.
            wasInAutoSubscribe = scopedHandleWrapper.inAutoSubscribe;
            scopedHandleWrapper.inAutoSubscribe = true;

            // If in a forbidAutoSubscribeWrapper method, any further @autoSubscribe methods are safe.
            wasUseAutoSubscriptions = scopedHandleWrapper.useAutoSubscriptions;
            if (scopedHandleWrapper.useAutoSubscriptions === AutoOptions.Forbid) {
                scopedHandleWrapper.useAutoSubscriptions = AutoOptions.None;
            }

            return existingMethod.apply(this, args);
        }, () => {
            scopedHandleWrapper.inAutoSubscribe = wasInAutoSubscribe;
            scopedHandleWrapper.useAutoSubscriptions = wasUseAutoSubscriptions;
        });

        return result;
    };

    copyMethodMetadata(existingMethod, replacementMethod);
    return markAutoSubscribeDecorator(replacementMethod);
}

function createWarnIfAutoSubscribeEnabledMethod<This, Args extends any[], Return>(
        existingMethod: ResubMethod<This, Args, Return>,
        methodName: string): ResubMethod<This, Args, Return> {
    // Note: we need to be given 'this', so cannot use '=>' syntax.
    const replacementMethod = function WarnIfAutoSubscribeEnabled(this: This, ...args: Args): Return {
        assertAutoSubscribeStoreDecorated(this, methodName);
        assert(!handlerWrapper || handlerWrapper.useAutoSubscriptions !== AutoOptions.Enabled || handlerWrapper.inAutoSubscribe,
            `Only Store methods with the @autoSubscribe decorator can be called right now (e.g. in _buildState): "${ methodName }"`);

        return existingMethod.apply(this, args);
    };

    return copyMethodMetadata(existingMethod, replacementMethod);
}

// Warns if the method is used in components' @enableAutoSubscribe methods. E.g. _buildState.
export function warnIfAutoSubscribeEnabled<This, Args extends any[], Return>(
        existingMethod: ResubMethod<This, Args, Return>,
        context: ClassMethodDecoratorContext<This, ResubMethod<This, Args, Return>>,
): ResubMethod<This, Args, Return> {
    assertMethodContext(context, 'warnIfAutoSubscribeEnabled');

    if (!Options.development) {
        // Disable warning for production.
        return existingMethod;
    }

    return createWarnIfAutoSubscribeEnabledMethod(existingMethod, String(context.name));
}

const autoSubscribeHookHandler = {
    handle(self: any, store: StoreBase, key: string) {
        const [ , setter ] = useState();
        useEffect(() => {
            const token = store.subscribe(() => {
                // Always trigger a rerender
                setter({} as any);
            }, key);
            return () => {
                store.unsubscribe(token);
            };
        }, [store, key]);
    },
};

export function withResubAutoSubscriptions<T extends Function>(func: T): T {
    return createAutoSubscribeWrapper(autoSubscribeHookHandler, AutoOptions.Enabled, func, autoSubscribeHookHandler);
}
