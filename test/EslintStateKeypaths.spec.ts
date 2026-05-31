import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';

import resubPlugin from '../eslint/index.mjs';

function lint(code: string): Linter.LintMessage[] {
    const linter = new Linter({ configType: 'flat' });

    return linter.verify(code, [
        {
            files: ['**/*.ts'],
            languageOptions: {
                ecmaVersion: 2022,
                parser: tsParser,
                sourceType: 'module',
            },
            plugins: {
                resub: resubPlugin,
            },
            rules: {
                'resub/state-keypaths': 'error',
            },
        },
    ], {
        filename: 'store.ts',
    });
}

describe('resub/state-keypaths', () => {
    it('allows state field keys and compound keys with dynamic path segments', () => {
        const messages = lint(`
            class DeviceStore {
                static DevicePGNs = 'devicePGNs';
                private _state!: {
                    devicePGNs: string[];
                    devices: Record<string, { pgns: string[] }>;
                };

                @autoSubscribeWithKey(DeviceStore.DevicePGNs)
                getAllDevicePGNs() {
                    return this._state.devicePGNs;
                }

                setAllDevicePGNs(devicePGNs: string[]) {
                    this._state.devicePGNs = devicePGNs;
                    this.trigger(DeviceStore.DevicePGNs);
                }

                @autoSubscribeWithKey('pgns')
                @key(0)
                getDevicePGNs(deviceId: string) {
                    return this._state.devices[deviceId].pgns;
                }

                setDevicePGNs(deviceId: string, pgns: string[]) {
                    this._state.devices[deviceId].pgns = pgns;
                    this.trigger(formCompoundKey(deviceId, 'pgns'));
                }

                watchAll() {
                    this.subscribe(() => {});
                }
            }
        `);

        expect(messages).toEqual([]);
    });

    it('reports keys that do not match state field paths', () => {
        const messages = lint(`
            class DeviceStore {
                private _state!: {
                    devicePGNs: string[];
                    devices: Record<string, { pgns: string[] }>;
                };

                @autoSubscribeWithKey('devicePgns')
                getAllDevicePGNs() {
                    return this._state.devicePGNs;
                }

                setAllDevicePGNs(devicePGNs: string[]) {
                    this._state.devicePGNs = devicePGNs;
                    this.trigger('devicePgns');
                }

                setDevicePGNs(deviceId: string, pgns: string[]) {
                    this._state.devices[deviceId].pgns = pgns;
                    this.trigger(formCompoundKey(deviceId, 'pgNs'));
                }

                watchWrongKey() {
                    this.subscribe(() => {}, 'missing');
                }
            }
        `);

        expect(messages.map(message => message.messageId)).toEqual([
            'invalidStateKeypath',
            'invalidStateKeypath',
            'invalidStateKeypath',
            'invalidStateKeypath',
        ]);
    });

    it('reports dynamic keys because they cannot be checked', () => {
        const messages = lint(`
            class DeviceStore {
                private _state!: {
                    devicePGNs: string[];
                };

                setAllDevicePGNs(devicePGNs: string[], key: string) {
                    this._state.devicePGNs = devicePGNs;
                    this.trigger(key);
                }
            }
        `);

        expect(messages.map(message => message.messageId)).toEqual([
            'uncheckableStateKeypath',
        ]);
    });
});
