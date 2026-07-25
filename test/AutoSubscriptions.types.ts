import {
    autoSubscribeWithKey,
    AutoSubscribeStore,
    keyArg,
    keyPath,
} from '../src/AutoSubscriptions';

@AutoSubscribeStore
export class ValidKeyPathStore {
    @autoSubscribeWithKey(
        keyPath('radars', keyArg(0), 'dataSets', keyArg(1), 'spokeData'),
        keyPath('radars', keyArg(0), 'scannerState'),
    )
    getRadarData(radarID: string, dataSetKey: string): string {
        return radarID + dataSetKey;
    }

    @autoSubscribeWithKey(keyPath('rows', 0, keyArg(0)))
    getRow(rowID: number): number {
        return rowID;
    }
}

@AutoSubscribeStore
export class InvalidKeyPathStore {
    // @ts-expect-error keyArg(1) is outside this method's parameter list.
    @autoSubscribeWithKey(keyPath('radars', keyArg(1)))
    getMissingArgument(radarID: string): string {
        return radarID;
    }

    // @ts-expect-error Object-valued method parameters cannot be subscription-key segments.
    @autoSubscribeWithKey(keyPath('radars', keyArg(0)))
    getObjectArgument(options: { radarID: string }): string {
        return options.radarID;
    }

    // @ts-expect-error Optional key arguments could resolve to undefined.
    @autoSubscribeWithKey(keyPath('radars', keyArg(0)))
    getOptionalArgument(radarID?: string): string | undefined {
        return radarID;
    }
}

// @ts-expect-error keyArg indexes must be non-negative integers.
keyArg(-1);
// @ts-expect-error keyArg indexes must be non-negative integers.
keyArg(1.5);
