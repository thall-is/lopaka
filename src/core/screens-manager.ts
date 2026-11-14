import { ProjectScreen } from '/src/types';
import { generateUID, toCppVariableName } from '/src/utils';

export interface LopakaProjectBundle {
    version: number;
    platform: string;
    display: { x: number; y: number };
    activeScreenId?: number;
    exportedAt: string;
    screens: ProjectScreen[];
    isSingleScreen?: boolean;
}

export interface SingleScreenBundle {
    version: number;
    type: 'lopaka-screen';
    platform: string;
    display: { x: number; y: number };
    exportedAt: string;
    screen: ProjectScreen;
}

export function getScreensStorageKey(platform: string): string {
    return `${platform}_lopaka_screens`;
}

export function getActiveScreenIdKey(platform: string): string {
    return `${platform}_lopaka_active_screen_id`;
}

export function getLegacyLayersKey(platform: string): string {
    return `${platform}_lopaka_layers`;
}

export function loadPlatformScreens(
    platform: string,
    storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): { screens: ProjectScreen[]; activeScreenId: number } {
    let screens: ProjectScreen[] = [];

    try {
        const rawScreens = storage.getItem(getScreensStorageKey(platform));
        if (rawScreens) {
            const parsed = JSON.parse(rawScreens);
            if (Array.isArray(parsed)) {
                screens = parsed
                    .filter((item) => item && typeof item === 'object')
                    .map((item, idx) => ({
                        ...item,
                        id: typeof item.id === 'number' ? item.id : idx + 1,
                        title: typeof item.title === 'string' && item.title.trim() ? item.title : `screen_${idx + 1}`,
                        layers: Array.isArray(item.layers) ? item.layers : [],
                        img_preview: typeof item.img_preview === 'string' ? item.img_preview : '',
                        order: typeof item.order === 'number' ? item.order : idx,
                    }));
            }
        }
    } catch {
        screens = [];
    }

    if (screens.length === 0) {
        let legacyLayers: any[] = [];
        try {
            const rawLegacy = storage.getItem(getLegacyLayersKey(platform));
            if (rawLegacy) {
                const parsedLegacy = JSON.parse(rawLegacy);
                if (Array.isArray(parsedLegacy)) {
                    legacyLayers = parsedLegacy;
                }
            }
        } catch {
            legacyLayers = [];
        }

        screens = [
            {
                id: 1,
                title: 'main',
                layers: legacyLayers,
                img_preview: '',
                order: 0,
            },
        ];
        savePlatformScreens(platform, screens, 1, storage);
        return { screens, activeScreenId: 1 };
    }

    screens.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let activeScreenId = screens[0].id;
    const rawActiveId = storage.getItem(getActiveScreenIdKey(platform));
    if (rawActiveId) {
        const parsedId = parseInt(rawActiveId, 10);
        if (!Number.isNaN(parsedId) && screens.some((s) => s.id === parsedId)) {
            activeScreenId = parsedId;
        }
    }

    return { screens, activeScreenId };
}

export function savePlatformScreens(
    platform: string,
    screens: ProjectScreen[],
    activeScreenId?: number,
    storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): void {
    const normalized = screens.map((screen, idx) => ({
        ...screen,
        order: idx,
        layers: Array.isArray(screen.layers) ? screen.layers : [],
    }));

    storage.setItem(getScreensStorageKey(platform), JSON.stringify(normalized));

    if (activeScreenId !== undefined) {
        storage.setItem(getActiveScreenIdKey(platform), String(activeScreenId));
    }

    const activeScreen =
        normalized.find((s) => s.id === activeScreenId) ??
        normalized[0];

    if (activeScreen) {
        storage.setItem(getLegacyLayersKey(platform), JSON.stringify(activeScreen.layers ?? []));
    }
}

export function updateScreenSnapshotInStorage(
    platform: string,
    screenId: number,
    snapshot: { layers?: any[]; imagePreview?: string },
    storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): ProjectScreen[] {
    const { screens, activeScreenId } = loadPlatformScreens(platform, storage);
    let updated = false;

    const nextScreens = screens.map((screen) => {
        if (screen.id === screenId) {
            updated = true;
            return {
                ...screen,
                layers: snapshot.layers ?? screen.layers ?? [],
                ...(snapshot.imagePreview !== undefined ? { img_preview: snapshot.imagePreview } : {}),
            };
        }
        return screen;
    });

    if (updated) {
        savePlatformScreens(platform, nextScreens, activeScreenId, storage);
    }

    return nextScreens;
}

export function createScreenEntry(
    screens: ProjectScreen[],
    title?: string,
    layers: any[] = [],
    imgPreview: string = ''
): ProjectScreen {
    const nextId = screens.reduce((max, s) => Math.max(max, s.id || 0), 0) + 1;
    const baseTitle = title?.trim() || `screen_${nextId}`;
    const existingTitles = new Set(screens.map((s) => (s.title || '').trim()));

    let resolvedTitle = baseTitle;
    let suffix = 2;
    while (existingTitles.has(resolvedTitle)) {
        resolvedTitle = `${baseTitle}_${suffix++}`;
    }

    return {
        id: nextId,
        title: resolvedTitle,
        layers: JSON.parse(JSON.stringify(layers)),
        img_preview: imgPreview,
        order: screens.length,
    };
}

export function duplicateScreenEntry(
    screens: ProjectScreen[],
    sourceScreenId: number
): ProjectScreen | null {
    const source = screens.find((s) => s.id === sourceScreenId);
    if (!source) {
        return null;
    }

    const clonedLayers = JSON.parse(JSON.stringify(source.layers ?? [])).map((layer: any) => {
        if (layer && typeof layer === 'object') {
            return {
                ...layer,
                u: generateUID(),
            };
        }
        return layer;
    });

    return createScreenEntry(
        screens,
        `${source.title || `screen_${source.id}`}_copy`,
        clonedLayers,
        source.img_preview || ''
    );
}

export function exportSingleScreenBundle(
    platform: string,
    display: { x: number; y: number },
    screen: ProjectScreen
): string {
    const bundle: SingleScreenBundle = {
        version: 1,
        type: 'lopaka-screen',
        platform,
        display: { x: display.x, y: display.y },
        exportedAt: new Date().toISOString(),
        screen: {
            ...screen,
            title: screen.title?.trim() || toCppVariableName(`screen_${screen.id || 1}`),
            layers: Array.isArray(screen.layers) ? screen.layers : [],
            img_preview: screen.img_preview || '',
            order: screen.order ?? 0,
        },
    };
    return JSON.stringify(bundle, null, 2);
}

export function exportProjectBundle(
    platform: string,
    display: { x: number; y: number },
    screens: ProjectScreen[],
    activeScreenId?: number
): string {
    const bundle: LopakaProjectBundle = {
        version: 1,
        platform,
        display: { x: display.x, y: display.y },
        activeScreenId,
        exportedAt: new Date().toISOString(),
        screens: screens.map((s, idx) => ({
            ...s,
            title: s.title?.trim() || toCppVariableName(`screen_${s.id}`),
            layers: Array.isArray(s.layers) ? s.layers : [],
            img_preview: s.img_preview || '',
            order: idx,
        })),
    };
    return JSON.stringify(bundle, null, 2);
}

export function parseProjectBundle(jsonText: string): LopakaProjectBundle {
    const parsed = JSON.parse(jsonText);
    const isSingleScreen =
        Boolean(parsed) &&
        typeof parsed === 'object' &&
        (parsed.type === 'lopaka-screen' ||
            (parsed.screen && typeof parsed.screen === 'object' && !Array.isArray(parsed.screens)));

    const rawScreens = isSingleScreen ? [parsed.screen] : parsed?.screens;

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(rawScreens) || rawScreens.length === 0) {
        throw new Error('Invalid Lopaka project bundle: "screens" must be a non-empty array.');
    }

    const usedIds = new Set<number>();
    const screens: ProjectScreen[] = rawScreens.map((s: any, idx: number) => {
        let id = typeof s?.id === 'number' && Number.isFinite(s.id) ? s.id : idx + 1;
        while (usedIds.has(id)) {
            id++;
        }
        usedIds.add(id);

        const title = typeof s?.title === 'string' && s.title.trim() ? s.title.trim() : `screen_${id}`;
        return {
            id,
            title,
            layers: Array.isArray(s?.layers) ? s.layers : [],
            img_preview: typeof s?.img_preview === 'string' ? s.img_preview : '',
            order: idx,
        };
    });

    const displayX = typeof parsed.display?.x === 'number' && parsed.display.x > 0 ? parsed.display.x : 128;
    const displayY = typeof parsed.display?.y === 'number' && parsed.display.y > 0 ? parsed.display.y : 64;
    const activeScreenId =
        typeof parsed.activeScreenId === 'number' && screens.some((s) => s.id === parsed.activeScreenId)
            ? parsed.activeScreenId
            : screens[0].id;

    return {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        platform: typeof parsed.platform === 'string' ? parsed.platform : 'u8g2',
        display: { x: displayX, y: displayY },
        activeScreenId,
        exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
        screens,
        isSingleScreen,
    };
}
