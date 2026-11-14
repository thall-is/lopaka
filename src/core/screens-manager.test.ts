import { describe, expect, it } from 'vitest';
import {
    createScreenEntry,
    duplicateScreenEntry,
    exportProjectBundle,
    exportSingleScreenBundle,
    getActiveScreenIdKey,
    getLegacyLayersKey,
    getScreensStorageKey,
    loadPlatformScreens,
    parseProjectBundle,
    savePlatformScreens,
    updateScreenSnapshotInStorage,
} from './screens-manager';

function createMemoryStorage(initial: Record<string, string> = {}) {
    const map = new Map<string, string>(Object.entries(initial));
    return {
        getItem(key: string): string | null {
            return map.has(key) ? map.get(key)! : null;
        },
        setItem(key: string, value: string): void {
            map.set(key, String(value));
        },
        dump(): Record<string, string> {
            return Object.fromEntries(map.entries());
        },
    };
}

describe('screens-manager', () => {
    it('migrates legacy layers into initial main screen when screens key is absent', () => {
        const legacyLayers = [{ t: 'rect', u: 'abc1', p: [0, 0], s: [128, 12] }];
        const storage = createMemoryStorage({
            [getLegacyLayersKey('u8g2')]: JSON.stringify(legacyLayers),
        });

        const { screens, activeScreenId } = loadPlatformScreens('u8g2', storage);

        expect(activeScreenId).toBe(1);
        expect(screens).toHaveLength(1);
        expect(screens[0]).toMatchObject({
            id: 1,
            title: 'main',
            layers: legacyLayers,
            order: 0,
        });
        expect(JSON.parse(storage.getItem(getScreensStorageKey('u8g2'))!)).toHaveLength(1);
        expect(storage.getItem(getActiveScreenIdKey('u8g2'))).toBe('1');
    });

    it('creates new screens with sequential IDs and unique titles', () => {
        const existing = [
            { id: 1, title: 'main', layers: [], img_preview: '', order: 0 },
            { id: 3, title: 'screen_4', layers: [], img_preview: '', order: 1 },
        ];

        const nextA = createScreenEntry(existing);
        expect(nextA.id).toBe(4);
        expect(nextA.title).toBe('screen_4_2');
        expect(nextA.order).toBe(2);

        const nextB = createScreenEntry([...existing, nextA], 'main');
        expect(nextB.id).toBe(5);
        expect(nextB.title).toBe('main_2');
    });

    it('deep-clones layers and regenerates layer UIDs when duplicating a screen', () => {
        const screens = [
            {
                id: 1,
                title: 'now_playing',
                layers: [
                    { t: 'string', u: 'orig_uid_1', x: 4, y: 10, text: 'MPS3' },
                    { t: 'rect', u: 'orig_uid_2', p: [0, 0], s: [10, 10] },
                ],
                img_preview: 'data:image/png;base64,AAA',
                order: 0,
            },
        ];

        const copy = duplicateScreenEntry(screens, 1);
        expect(copy).not.toBeNull();
        expect(copy!.id).toBe(2);
        expect(copy!.title).toBe('now_playing_copy');
        expect(copy!.img_preview).toBe('data:image/png;base64,AAA');
        expect(copy!.layers).toHaveLength(2);
        expect(copy!.layers![0].u).not.toBe('orig_uid_1');
        expect(copy!.layers![1].u).not.toBe('orig_uid_2');

        // Mutating cloned layer does not affect source screen
        copy!.layers![0].text = 'MODIFIED';
        expect(screens[0].layers![0].text).toBe('MPS3');

        expect(duplicateScreenEntry(screens, 999)).toBeNull();
    });

    it('updates individual screen snapshots and keeps legacy layers key synced with active screen', () => {
        const screens = [
            { id: 1, title: 'main', layers: [{ t: 'rect', u: 'l1' }], img_preview: '', order: 0 },
            { id: 2, title: 'settings', layers: [{ t: 'circle', u: 'l2' }], img_preview: '', order: 1 },
        ];
        const storage = createMemoryStorage();
        savePlatformScreens('u8g2', screens, 2, storage);

        expect(JSON.parse(storage.getItem(getLegacyLayersKey('u8g2'))!)).toEqual([{ t: 'circle', u: 'l2' }]);

        const newLayers = [{ t: 'circle', u: 'l2' }, { t: 'line', u: 'l3' }];
        const updated = updateScreenSnapshotInStorage(
            'u8g2',
            2,
            { layers: newLayers, imagePreview: 'data:image/png;base64,NEW' },
            storage
        );

        expect(updated.find((s) => s.id === 2)?.layers).toEqual(newLayers);
        expect(updated.find((s) => s.id === 2)?.img_preview).toBe('data:image/png;base64,NEW');
        expect(JSON.parse(storage.getItem(getLegacyLayersKey('u8g2'))!)).toEqual(newLayers);
    });

    it('round-trips multi-screen projects through exportProjectBundle and parseProjectBundle', () => {
        const screens = [
            { id: 1, title: 'home', layers: [{ t: 'string', u: 'u1', d: 'Hi' }], img_preview: 'p1', order: 0 },
            { id: 2, title: 'menu', layers: [{ t: 'rect', u: 'u2' }], img_preview: 'p2', order: 1 },
        ];

        const json = exportProjectBundle('u8g2', { x: 128, y: 64 }, screens, 2);
        const parsed = parseProjectBundle(json);

        expect(parsed.version).toBe(1);
        expect(parsed.platform).toBe('u8g2');
        expect(parsed.display).toEqual({ x: 128, y: 64 });
        expect(parsed.activeScreenId).toBe(2);
        expect(parsed.screens).toHaveLength(2);
        expect(parsed.screens[0]).toMatchObject({ id: 1, title: 'home', layers: screens[0].layers, order: 0 });
        expect(parsed.screens[1]).toMatchObject({ id: 2, title: 'menu', layers: screens[1].layers, order: 1 });

        expect(() => parseProjectBundle('{"screens":[]}')).toThrow();
    });

    it('round-trips a single working screen through exportSingleScreenBundle and parseProjectBundle', () => {
        const workingScreen = {
            id: 7,
            title: 'seele_custom',
            layers: [{ t: 'rect', u: 'r1', p: [0, 0], s: [46, 64] }],
            img_preview: 'data:image/png;base64,ABC',
            order: 2,
        };

        const json = exportSingleScreenBundle('u8g2', { x: 128, y: 64 }, workingScreen);
        const parsed = parseProjectBundle(json);

        expect(parsed.isSingleScreen).toBe(true);
        expect(parsed.platform).toBe('u8g2');
        expect(parsed.display).toEqual({ x: 128, y: 64 });
        expect(parsed.screens).toHaveLength(1);
        expect(parsed.screens[0]).toMatchObject({
            id: 7,
            title: 'seele_custom',
            layers: workingScreen.layers,
            img_preview: 'data:image/png;base64,ABC',
        });
    });
});
