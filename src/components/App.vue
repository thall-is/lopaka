<script
    lang="ts"
    setup
>
import { nextTick, onMounted, ref, watch } from 'vue';
import { AbstractLayer } from '/src/core/layers/abstract.layer';
import { Point } from '/src/core/point';
import {
    createScreenEntry,
    duplicateScreenEntry,
    exportProjectBundle,
    exportSingleScreenBundle,
    loadPlatformScreens,
    parseProjectBundle,
    savePlatformScreens,
} from '/src/core/screens-manager';
import { useSession } from '/src/core/session';
import { U8g2Platform } from '/src/platforms/u8g2';
import { toCppVariableName } from '/src/utils';
import FuiEditor from '/src/components/fui/FuiEditor.vue';
import { Project, ProjectScreen } from '/src/types';
import FuiLayers from './fui/layers/FuiLayers.vue';
import FuiScreens from './fui/screens/FuiScreens.vue';
import FuiDeviceScreensModal, {
    DeviceImportPayload,
    Mps3FirmwareScreen,
} from './fui/screens/FuiDeviceScreensModal.vue';

const session = useSession();
const { setIsPublic } = session;
const currenProject = ref({} as Project);
const currentScreen = ref({} as ProjectScreen);
const isScreenLoaded = ref(false);
const isScreenNotFound = ref(false);
const isDeviceModalOpen = ref(false);
const infoMessage = ref();
const errorMessage = ref();
let isScreensInitialized = false;

const emit = defineEmits(['showModal']);

function captureCurrentScreenSnapshot() {
    if (!currenProject.value.screens || !currentScreen.value?.id) return;
    const layers = session.layersManager.layers.map((l) => l.state);
    const preview = session.virtualScreen.canvas?.toDataURL() || currentScreen.value.img_preview || '';
    currenProject.value.screens = currenProject.value.screens.map((item) => {
        if (item && item.id === currentScreen.value.id) {
            return {
                ...item,
                layers,
                img_preview: preview,
            };
        }
        return item;
    });
    const updated = currenProject.value.screens.find((s) => s.id === currentScreen.value.id);
    if (updated) {
        currentScreen.value = updated;
    }
}

async function activateScreen(screen: ProjectScreen, persist = true) {
    currentScreen.value = screen;
    const resolvedTitle = screen.title?.trim() || `screen_${screen.id}`;
    session.setScreenTitle(resolvedTitle);
    session.editor.clear();
    session.history.clear(false);
    await session.layersManager.loadLayers(screen.layers ?? []);
    session.virtualScreen.redraw();
    session.state.immidiateUpdates++;
    if (persist && currenProject.value.screens && session.state.platform) {
        savePlatformScreens(session.state.platform, currenProject.value.screens, screen.id);
    }
    requestAnimationFrame(() => {
        if (currentScreen.value?.id === screen.id) {
            captureCurrentScreenSnapshot();
            if (persist && currenProject.value.screens && session.state.platform) {
                savePlatformScreens(session.state.platform, currenProject.value.screens, screen.id);
            }
        }
    });
}

async function handleSelectScreen(screenId: number) {
    if (screenId === currentScreen.value?.id || !currenProject.value.screens) return;
    captureCurrentScreenSnapshot();
    const target = currenProject.value.screens.find((s) => s.id === screenId);
    if (target) {
        await activateScreen(target, true);
    }
}

async function handleAddScreen() {
    if (!currenProject.value.screens) return;
    captureCurrentScreenSnapshot();
    const newScreen = createScreenEntry(currenProject.value.screens);
    currenProject.value.screens = [...currenProject.value.screens, newScreen];
    await activateScreen(newScreen, true);
    setInfoMessage(`Screen "${newScreen.title}" created`);
}

async function handleDuplicateScreen(screenId: number) {
    if (!currenProject.value.screens) return;
    captureCurrentScreenSnapshot();
    const copy = duplicateScreenEntry(currenProject.value.screens, screenId);
    if (!copy) return;
    currenProject.value.screens = [...currenProject.value.screens, copy];
    await activateScreen(copy, true);
    setInfoMessage(`Duplicated as "${copy.title}"`);
}

function handleRenameScreen(screenId: number, newTitle: string) {
    if (!currenProject.value.screens) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    currenProject.value.screens = currenProject.value.screens.map((s) =>
        s.id === screenId ? { ...s, title: trimmed } : s
    );
    if (currentScreen.value?.id === screenId) {
        const updated = currenProject.value.screens.find((s) => s.id === screenId);
        if (updated) {
            currentScreen.value = updated;
        }
        session.setScreenTitle(trimmed);
        session.state.immidiateUpdates++;
    }
    savePlatformScreens(session.state.platform, currenProject.value.screens, currentScreen.value?.id);
}

async function handleRemoveScreen(screenId: number) {
    const screens = currenProject.value.screens;
    if (!screens || screens.length <= 1) return;
    const idx = screens.findIndex((s) => s.id === screenId);
    if (idx === -1) return;
    const next = screens.filter((s) => s.id !== screenId);
    currenProject.value.screens = next;
    if (currentScreen.value?.id === screenId) {
        const fallback = next[Math.min(idx, next.length - 1)] || next[0];
        await activateScreen(fallback, true);
    } else {
        savePlatformScreens(session.state.platform, currenProject.value.screens, currentScreen.value?.id);
    }
    setInfoMessage('Screen removed');
}

function handleMoveScreen(screenId: number, delta: -1 | 1) {
    const screens = currenProject.value.screens;
    if (!screens) return;
    const idx = screens.findIndex((s) => s.id === screenId);
    const targetIdx = idx + delta;
    if (idx === -1 || targetIdx < 0 || targetIdx >= screens.length) return;
    const next = [...screens];
    const [item] = next.splice(idx, 1);
    next.splice(targetIdx, 0, item);
    currenProject.value.screens = next.map((s, order) => ({ ...s, order }));
    savePlatformScreens(session.state.platform, currenProject.value.screens, currentScreen.value?.id);
}

function downloadJsonFile(filename: string, jsonText: string) {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function handleExportCurrentScreen() {
    if (!currentScreen.value?.id) return;
    handleExportScreenById(currentScreen.value.id);
}

function handleExportScreenById(screenId: number) {
    if (!currenProject.value.screens?.length) return;
    captureCurrentScreenSnapshot();
    const target = currenProject.value.screens.find((s) => s.id === screenId);
    if (!target) return;
    const json = exportSingleScreenBundle(session.state.platform, session.state.display, target);
    const slug = toCppVariableName(target.title || `screen_${target.id}`);
    downloadJsonFile(`${slug}.lopaka-screen.json`, json);
    setInfoMessage(`Tela "${target.title}" exportada`);
}

function handleExportProject() {
    if (!currenProject.value.screens?.length) return;
    captureCurrentScreenSnapshot();
    const json = exportProjectBundle(
        session.state.platform,
        session.state.display,
        currenProject.value.screens,
        currentScreen.value?.id
    );
    downloadJsonFile(`lopaka_${session.state.platform}_screens.lopaka.json`, json);
    setInfoMessage('Projeto completo exportado');
}

async function handleImportProject(file: File) {
    try {
        const text = await file.text();
        const bundle = parseProjectBundle(text);
        const targetPlatform =
            bundle.platform && session.platforms[bundle.platform] ? bundle.platform : session.state.platform;

        if (bundle.isSingleScreen && targetPlatform === session.state.platform && currentScreen.value?.id) {
            const imported = bundle.screens[0];
            const updatedScreen: ProjectScreen = {
                ...currentScreen.value,
                title: imported.title || currentScreen.value.title,
                layers: imported.layers ?? [],
                img_preview: imported.img_preview || '',
            };
            currenProject.value.screens = (currenProject.value.screens || []).map((s) =>
                s.id === updatedScreen.id ? updatedScreen : s
            );
            if (bundle.display) {
                session.setDisplay(new Point(bundle.display.x, bundle.display.y));
                currenProject.value.screen_x = bundle.display.x;
                currenProject.value.screen_y = bundle.display.y;
            }
            await activateScreen(updatedScreen, true);
            setInfoMessage(`Tela "${updatedScreen.title}" carregada na área de trabalho`);
            return;
        }

        const active = bundle.screens.find((s) => s.id === bundle.activeScreenId) || bundle.screens[0];
        savePlatformScreens(targetPlatform, bundle.screens, active.id);
        currenProject.value.screens = bundle.screens;

        if (bundle.display) {
            session.setDisplay(new Point(bundle.display.x, bundle.display.y));
            currenProject.value.screen_x = bundle.display.x;
            currenProject.value.screen_y = bundle.display.y;
        }

        if (targetPlatform !== session.state.platform) {
            session.state.platform = targetPlatform;
        } else {
            await activateScreen(active, true);
        }
        setInfoMessage(
            bundle.isSingleScreen
                ? `Tela "${active.title}" importada`
                : `Importadas ${bundle.screens.length} telas`
        );
    } catch (error: any) {
        setErrorMessage(`Import failed: ${error?.message || error}`);
    }
}

async function handleImportScreenAsNew(file: File) {
    try {
        const text = await file.text();
        const bundle = parseProjectBundle(text);
        captureCurrentScreenSnapshot();

        let workingList = [...(currenProject.value.screens || [])];
        let firstCreated: ProjectScreen | null = null;
        for (const scr of bundle.screens) {
            const created = createScreenEntry(workingList, scr.title, scr.layers ?? [], scr.img_preview ?? '');
            workingList.push(created);
            if (!firstCreated) {
                firstCreated = created;
            }
        }
        if (firstCreated) {
            currenProject.value.screens = workingList;
            if (bundle.display) {
                session.setDisplay(new Point(bundle.display.x, bundle.display.y));
                currenProject.value.screen_x = bundle.display.x;
                currenProject.value.screen_y = bundle.display.y;
            }
            await activateScreen(firstCreated, true);
            setInfoMessage(`Importada como nova tela "${firstCreated.title}"`);
        }
    } catch (error: any) {
        setErrorMessage(`Import failed: ${error?.message || error}`);
    }
}

async function ensureU8g2Display() {
    if (session.state.platform !== U8g2Platform.id) {
        isScreensInitialized = false;
        session.state.platform = U8g2Platform.id;
        await nextTick();
        await session.preparePlatform(U8g2Platform.id, false, []);
        const { screens, activeScreenId } = loadPlatformScreens(U8g2Platform.id);
        currenProject.value.platform = U8g2Platform.id;
        currenProject.value.screens = screens;
        currentScreen.value = screens.find((s) => s.id === activeScreenId) || screens[0];
        isScreensInitialized = true;
    }
    if (session.state.display.x !== 128 || session.state.display.y !== 64) {
        session.setDisplay(new Point(128, 64));
        currenProject.value.screen_x = 128;
        currenProject.value.screen_y = 64;
    }
}

async function applyCCodeToActiveScreen(title: string, cCode: string, overlay = false) {
    if (overlay) {
        await session.importCode(cCode, true);
        const layers = session.layersManager.layers;
        const added = layers[layers.length - 1];
        if (added) {
            added.name = title || 'mps3_ref_overlay';
            added.overlay = true;
            added.locked = true;
            added.updateBounds();
            added.draw();
        }
    } else {
        if (currentScreen.value?.id && title) {
            currenProject.value.screens = (currenProject.value.screens || []).map((s) =>
                s.id === currentScreen.value.id ? { ...s, title } : s
            );
            currentScreen.value = { ...currentScreen.value, title };
            session.setScreenTitle(title);
        }
        await session.importCode(cCode, false);
    }
    session.virtualScreen.redraw();
    session.state.immidiateUpdates++;
    await nextTick();
    captureCurrentScreenSnapshot();
    if (currenProject.value.screens && session.state.platform) {
        savePlatformScreens(session.state.platform, currenProject.value.screens, currentScreen.value?.id);
    }
}

async function handleImportDeviceToCurrent(payload: DeviceImportPayload) {
    try {
        await ensureU8g2Display();
        await applyCCodeToActiveScreen(payload.title, payload.cCode, Boolean(payload.overlay));
        isDeviceModalOpen.value = false;
        setInfoMessage(
            payload.overlay
                ? `Guia overlay "${payload.title}" adicionada à tela`
                : `Tela MPS3 "${payload.title}" importada para a tela atual`
        );
    } catch (error: any) {
        setErrorMessage(`Erro ao importar tela MPS3: ${error?.message || error}`);
    }
}

async function handleImportDeviceAsNew(payload: DeviceImportPayload) {
    try {
        await ensureU8g2Display();
        captureCurrentScreenSnapshot();
        const created = createScreenEntry(currenProject.value.screens || [], payload.title, []);
        currenProject.value.screens = [...(currenProject.value.screens || []), created];
        await activateScreen(created, false);
        await applyCCodeToActiveScreen(created.title, payload.cCode, false);
        isDeviceModalOpen.value = false;
        setInfoMessage(`Tela MPS3 "${created.title}" criada`);
    } catch (error: any) {
        setErrorMessage(`Erro ao importar tela MPS3: ${error?.message || error}`);
    }
}

async function handleImportAllDeviceScreens(screens: Mps3FirmwareScreen[]) {
    try {
        await ensureU8g2Display();
        captureCurrentScreenSnapshot();
        for (const item of screens) {
            const created = createScreenEntry(currenProject.value.screens || [], item.title, []);
            currenProject.value.screens = [...(currenProject.value.screens || []), created];
            await activateScreen(created, false);
            await applyCCodeToActiveScreen(created.title, item.cCode, false);
        }
        isDeviceModalOpen.value = false;
        setInfoMessage(`${screens.length} telas do firmware MPS3 importadas`);
    } catch (error: any) {
        setErrorMessage(`Erro ao importar catálogo MPS3: ${error?.message || error}`);
    }
}

async function handleCopyAllCode() {
    if (!currenProject.value.screens?.length) return;
    captureCurrentScreenSnapshot();
    const platformId = session.state.platform;
    const platformObj = session.platforms[platformId];
    if (!platformObj) return;

    const prevScreenTitle = session.state.screenTitle;
    const blocks: string[] = [];

    const allFontNames = Array.from(
        new Set(
            currenProject.value.screens.flatMap((s) =>
                (s.layers ?? [])
                    .filter((l) => (l?.t === 'string' || l?.t === 'textarea') && l?.f)
                    .map((l) => l.f)
            )
        )
    );
    await session.layersManager.loadFontsForLayers(allFontNames);

    for (const scr of currenProject.value.screens) {
        const title = scr.title?.trim() || `screen_${scr.id}`;
        let codeStr = '';
        if (scr.id === currentScreen.value?.id) {
            session.setScreenTitle(title);
            codeStr = session.generateCode().code ?? '';
        } else {
            const tempLayers: AbstractLayer[] = [];
            for (let i = 0; i < (scr.layers ?? []).length; i++) {
                const st = scr.layers[i];
                const tool = session.editor.tools[st?.t];
                if (tool) {
                    const layer = tool.createLayer();
                    layer.resize(session.state.display, session.state.scale);
                    layer.state = st;
                    layer.index = st.i ?? i + 1;
                    layer.draw();
                    if (!layer.modifiers.overlay || !layer.modifiers.overlay.getValue()) {
                        tempLayers.push(layer);
                    }
                }
            }
            const raw = platformObj.generateSourceCode(tempLayers, session.virtualScreen.ctx, title);
            codeStr = platformObj.sourceMapParser.parse(raw).code ?? '';
        }
        blocks.push(
            `// ==========================================\n// Screen: ${title}\n// ==========================================\n${codeStr}`
        );
    }

    session.setScreenTitle(prevScreenTitle);
    await navigator.clipboard.writeText(blocks.join('\n\n'));
    setInfoMessage(`Copied code for ${currenProject.value.screens.length} screens`);
}

watch(
    () => session.state.platform,
    (newPlatform, oldPlatform) => {
        if (!isScreensInitialized || !newPlatform || newPlatform === oldPlatform) return;
        const { screens, activeScreenId } = loadPlatformScreens(newPlatform);
        const active = screens.find((s) => s.id === activeScreenId) || screens[0];
        currenProject.value.platform = newPlatform;
        currenProject.value.screens = screens;
        currentScreen.value = active;
        session.setScreenTitle(active.title || `screen_${active.id}`);
        savePlatformScreens(newPlatform, screens, active.id);
    }
);

onMounted(async () => {
    session.state.customImages = [];
    session.state.customFonts = [];
    isScreenLoaded.value = true;
    currenProject.value = {
        id: 0,
        title: 'MPS3 UI Project',
        screens: [{ id: 1, title: 'main', layers: [], order: 0 }],
        platform: session.state.platform,
        screen_x: session.state.display.x,
        screen_y: session.state.display.y,
        private: true,
    };
    await session.initSandbox();
    const { screens, activeScreenId } = loadPlatformScreens(session.state.platform);
    currenProject.value = {
        id: 0,
        title: 'MPS3 UI Project',
        screens,
        platform: session.state.platform,
        screen_x: session.state.display.x,
        screen_y: session.state.display.y,
        private: true,
    };
    const active = screens.find((s) => s.id === activeScreenId) || screens[0];
    await activateScreen(active, true);
    isScreensInitialized = true;
    setIsPublic(false);
    requestAnimationFrame(() => {
        captureCurrentScreenSnapshot();
        savePlatformScreens(session.state.platform, currenProject.value.screens, currentScreen.value.id);
    });
});

function setInfoMessage(msg) {
    infoMessage.value = msg;
    setTimeout(() => {
        infoMessage.value = null;
    }, 3000);
}
function setErrorMessage(msg) {
    errorMessage.value = msg;
    setTimeout(() => {
        errorMessage.value = null;
    }, 4000);
}
</script>

<template>
    <div class="flex flex-col flex-grow">
        <FuiEditor
            :project="currenProject"
            :screen="currentScreen"
            :isScreenLoaded="isScreenLoaded"
            :isScreenNotFound="isScreenNotFound"
            @setErrorMessage="setErrorMessage"
            @setInfoMessage="setInfoMessage"
        >
            <template #messages>
                <div
                    class="alert alert-warning"
                    v-if="errorMessage"
                >
                    <span>{{ errorMessage }}</span>
                </div>
                <div
                    class="alert alert-success"
                    v-if="infoMessage"
                >
                    <span>{{ infoMessage }}</span>
                </div>
            </template>
            <template #left>
                <div class="flex flex-col h-full">
                    <FuiScreens
                        :screens="currenProject.screens || []"
                        :activeScreenId="currentScreen?.id ?? 0"
                        @select="handleSelectScreen"
                        @add="handleAddScreen"
                        @duplicate="handleDuplicateScreen"
                        @rename="handleRenameScreen"
                        @remove="handleRemoveScreen"
                        @move="handleMoveScreen"
                        @exportProject="handleExportProject"
                        @exportCurrentScreen="handleExportCurrentScreen"
                        @exportScreen="handleExportScreenById"
                        @importProject="handleImportProject"
                        @importScreenAsNew="handleImportScreenAsNew"
                        @openDeviceModal="isDeviceModalOpen = true"
                        @copyAllCode="handleCopyAllCode"
                    />
                    <FuiLayers></FuiLayers>
                </div>
            </template>
            <template #title></template>
        </FuiEditor>
        <FuiDeviceScreensModal
            :isOpen="isDeviceModalOpen"
            @close="isDeviceModalOpen = false"
            @importToCurrent="handleImportDeviceToCurrent"
            @importAsNew="handleImportDeviceAsNew"
            @importAllFirmware="handleImportAllDeviceScreens"
        />
    </div>
    <datalist id="presetColors">
        <!-- 32 colors -->
        <!-- Grayscale -->
        <option>#FFFFFF</option>
        <option>#EEEEEE</option>
        <option>#BDBDBD</option>
        <option>#757575</option>
        <option>#424242</option>
        <option>#000000</option>

        <!-- Material UI Colors -->
        <option label="Red">#F44336</option>
        <option label="Pink">#E91E63</option>
        <option label="Purple">#9C27B0</option>
        <option label="Deep Purple">#673AB7</option>
        <option label="Indigo">#3F51B5</option>
        <option label="Blue">#2196F3</option>
        <option label="Light Blue">#03A9F4</option>
        <option label="Cyan">#00BCD4</option>
        <option label="Teal">#009688</option>
        <option label="Green">#4CAF50</option>
        <option label="Light Green">#8BC34A</option>
        <option label="Lime">#CDDC39</option>
        <option label="Yellow">#FFEB3B</option>
        <option label="Amber">#FFC107</option>
        <option label="Orange">#FF8200</option>
        <option label="Deep Orange">#FF5722</option>
        <option label="Brown">#795548</option>
        <option label="Blue Grey">#607D8B</option>
    </datalist>
</template>
<style lang="css">
body {
    visibility: visible !important;
}

.pixelated {
    image-rendering: pixelated;
}
</style>
