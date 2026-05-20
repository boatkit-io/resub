import * as React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedRoot {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: MountedRoot[] = [];

function createMountedRoot(): MountedRoot {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const mountedRoot = {
        container,
        root: createRoot(container),
    };
    mountedRoots.push(mountedRoot);
    return mountedRoot;
}

function removeMountedRoot(mountedRoot: MountedRoot): void {
    const rootIndex = mountedRoots.indexOf(mountedRoot);
    if (rootIndex >= 0) {
        mountedRoots.splice(rootIndex, 1);
    }

    if (mountedRoot.container.parentNode) {
        mountedRoot.container.parentNode.removeChild(mountedRoot.container);
    }
}

export function cleanupReactTestComponents(): void {
    while (mountedRoots.length > 0) {
        const mountedRoot = mountedRoots.pop() as MountedRoot;
        act(() => {
            mountedRoot.root.unmount();
        });
        removeMountedRoot(mountedRoot);
    }
}

export class RenderedComponent {
    private readonly _mountedRoot: MountedRoot;

    constructor(mountedRoot: MountedRoot) {
        this._mountedRoot = mountedRoot;
    }

    text(): string {
        return this._mountedRoot.container.textContent || '';
    }

    update(): void {
        act(() => {
            // Flush pending React work scheduled by store callbacks.
        });
    }

    unmount(): void {
        act(() => {
            this._mountedRoot.root.unmount();
        });
        removeMountedRoot(this._mountedRoot);
    }
}

export class ReactWrapper<P, S, C extends React.Component<P, S>> extends RenderedComponent {
    constructor(mountedRoot: MountedRoot, private readonly _props: P, private readonly _instance: C) {
        super(mountedRoot);
    }

    instance(): C {
        return this._instance;
    }

    prop<K extends keyof P>(key: K): P[K] {
        return this._props[key];
    }

    state(): Readonly<S>;
    state<K extends keyof S>(key: K): S[K];
    state<K extends keyof S>(key?: K): Readonly<S> | S[K] {
        const state = this.instance().state;
        return key == null ? state : state[key];
    }
}

export function mountComponent<P extends {}, S, C extends React.Component<P, S>>(
        Component: React.ComponentClass<P>, props: P): ReactWrapper<P, S, C> {
    const mountedRoot = createMountedRoot();
    let componentInstance: C | undefined;

    try {
        act(() => {
            const propsWithRef: P & React.RefAttributes<C> = {
                ...props,
                ref: (instance: C | null) => {
                    if (instance) {
                        componentInstance = instance;
                    }
                },
            };
            mountedRoot.root.render(React.createElement(Component, propsWithRef));
        });
    } catch (error) {
        removeMountedRoot(mountedRoot);
        throw error;
    }

    if (!componentInstance) {
        removeMountedRoot(mountedRoot);
        throw new Error('Mounted component did not provide an instance.');
    }

    return new ReactWrapper<P, S, C>(mountedRoot, props, componentInstance);
}

export function renderComponent(element: React.ReactElement): RenderedComponent {
    const mountedRoot = createMountedRoot();

    try {
        act(() => {
            mountedRoot.root.render(element);
        });
    } catch (error) {
        removeMountedRoot(mountedRoot);
        throw error;
    }

    return new RenderedComponent(mountedRoot);
}
