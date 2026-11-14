<script
    setup
    lang="ts"
>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRefs } from 'vue';
import { logEvent } from '/src/utils';
import { addCustomFont, useSession } from '/src/core/session';
import Icon from '/src/components/layout/Icon.vue';
import bdf2gfx from '/src/draw/fonts/bdf2gfx';
import SelectFontWizard from './SelectFontWizard.vue';

const props = defineProps<{
    fonts: TPlatformFont[];
    fontsUsed: string[];
    disabled: boolean;
    fontValue: string;
    project_id: number;
}>();

const session = useSession();
const { state } = session;
const { platform, customFonts } = toRefs(state);

const fontTypes = computed(() => {
    if (!platform.value) return null;
    switch (platform.value) {
        case 'flipper':
        // TODO: add support for TTF fonts upload
        case 'esphome':
        case 'micropython':
            return null;
        case 'u8g2':
            return '.bdf';
        default:
            return '.h, .bdf, .ttf, .otf, .woff';
    }
});

const fontsList = computed(() => {
    return [...props.fonts, ...customFonts.value];
});

const fontsMenu = ref<HTMLElement | null>(null);
const fontsBtn = ref<HTMLElement | null>(null);
const fileLoadedCounter = ref(0);
const isLoading = ref(false);
const isFontWarningVisible = ref(false);
const isWizardVisible = ref(false);
const fontFile = ref();
const isMenuOpen = ref(false);
const menuStyle = ref<Record<string, string>>({});

const emit = defineEmits(['change']);

function updateMenuPosition() {
    if (!fontsBtn.value) return;
    const rect = fontsBtn.value.getBoundingClientRect();
    const menuWidth = 208;
    const margin = 8;
    const maxMenuHeight = Math.floor(window.innerHeight * 0.75);
    const left = Math.max(margin, rect.left - menuWidth - 6);
    const top = Math.max(margin, Math.min(rect.top - 8, window.innerHeight - maxMenuHeight - margin));
    menuStyle.value = {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${menuWidth}px`,
        zIndex: '9999',
    };
}

function onClick(font: TPlatformFont) {
    hideFontsMenu();
    fontsBtn.value?.blur();
    logEvent('select_font', font.name);
    emit('change', {
        target: { value: font.name, title: font.title },
    });
}

function hideFontsMenu() {
    isMenuOpen.value = false;
}

function showFontsMenu() {
    if (props.disabled) return;
    updateMenuPosition();
    isMenuOpen.value = true;
    nextTick(() => {
        updateMenuPosition();
        const activeEl = fontsMenu.value?.querySelector('a.bg-neutral') as HTMLElement | null;
        activeEl?.scrollIntoView({ block: 'nearest' });
    });
}

function toggleFontsMenu() {
    if (isMenuOpen.value) {
        hideFontsMenu();
    } else {
        showFontsMenu();
    }
}

function handleDocumentPointerDown(e: MouseEvent) {
    if (!isMenuOpen.value) return;
    const target = e.target as Node | null;
    if (fontsBtn.value?.contains(target) || fontsMenu.value?.contains(target)) {
        return;
    }
    hideFontsMenu();
}

function handleDocumentKeyDown(e: KeyboardEvent) {
    if (isMenuOpen.value && e.key === 'Escape') {
        hideFontsMenu();
    }
}

onMounted(() => {
    document.addEventListener('mousedown', handleDocumentPointerDown, true);
    document.addEventListener('keydown', handleDocumentKeyDown);
});

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentPointerDown, true);
    document.removeEventListener('keydown', handleDocumentKeyDown);
});

async function onFileChange(e: Event) {
    logEvent('import_font');
    isLoading.value = true;
    fileLoadedCounter.value += 1;

    const files = (e.target as HTMLInputElement).files;
    if (!files || !files.length) return;
    const file = files[0];
    if (!file.name) {
        return;
    }

    showFontsMenu();

    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isU8G2Platform = platform.value === 'u8g2';

    // BDF fonts for adafruit-like platforms
    if (!isU8G2Platform && fileExtension === '.bdf') {
        fontFile.value = await bdf2gfx(file);
        await uploadFont(fontFile.value);
        return;
    }

    // TrueType fonts for adafruit-like platforms
    // Run wizard
    if (!isU8G2Platform && fileExtension !== '.h') {
        fontFile.value = file;
        isWizardVisible.value = true;
        return;
    }

    // TODO: convert GFX to BDF
    if (isU8G2Platform && fileExtension === '.h') {
        // const fontPackGFX = new GFXFont(file, file.name, null);
        // await fontPackGFX.fontReady;
        // console.log(fontPackGFX.fontData);
        // const bdfFont = encodeBDF(fontPackGFX.fontData);
        // console.log(bdfFont);

        // const bdfFontFile = new File([bdfFont], fontPackGFX.name + '.h', {type: 'text/plain'});
        // console.log(bdfFontFile);
        // await uploadFont(bdfFontFile);
        return;
    }

    // No conversion needed:
    // - GFX fonts for adafruit-like platforms
    // - BDF fonts for u8g2
    fontFile.value = file;
    await uploadFont(fontFile.value);
}

async function uploadFont(fontFile) {
    // TODO: add a local fonts support
    // addCustomFont(asset);
    isLoading.value = false;
    closeWizard();
}

function deleteFont(fontToDelete) {
    customFonts.value = customFonts.value.filter((font) => font.file !== fontToDelete.file);
    // TODO: add a local fonts support
}

function showToast() {
    isFontWarningVisible.value = true;
    setTimeout(() => {
        isFontWarningVisible.value = false;
    }, 3000);
}

function closeWizard() {
    isWizardVisible.value = false;
    isLoading.value = false;
}
</script>

<template>
    <SelectFontWizard
        v-if="isWizardVisible"
        :font_src="fontFile"
        @cancel="closeWizard"
        @import="uploadFont"
    />
    <div class="toast toast-top toast-center z-50">
        <div
            class="alert alert-warning"
            v-if="isFontWarningVisible"
        >
            <span>Cannot delete a font that is being used in the current project</span>
        </div>
    </div>
    <button
        ref="fontsBtn"
        type="button"
        :disabled="disabled"
        class="select select-sm select-bordered relative"
        :class="{ 'cursor-not-allowed': disabled }"
        @click.stop="toggleFontsMenu"
    >
        <div class="truncate pointer-events-none w-[128px] text-left flex">
            {{fontsList.find((font) => font.name === fontValue)?.title}}
        </div>
    </button>
    <Teleport to="body">
        <div
            v-if="isMenuOpen"
            :style="menuStyle"
            class="rounded-box shadow-xl border border-base-content/20 overflow-hidden bg-secondary"
        >
            <ul
                ref="fontsMenu"
                class="menu menu-xs max-h-[75vh] overflow-x-hidden overflow-y-auto bg-secondary block w-full"
            >
                <li
                    v-for="font in fonts"
                    :key="font.name"
                >
                    <a
                        :class="{ 'bg-neutral text-primary': fontValue === font.name }"
                        @mousedown.prevent="onClick(font)"
                    >
                        {{ font.title }}
                    </a>
                </li>
            </ul>
        </div>
    </Teleport>
</template>
<style
    lang="css"
    scoped
>
.custom-font-item:hover .custom-font-icon {
    display: inline;
}

.custom-font-item.active .custom-font-icon {
    display: none;
}

.custom-font-icon {
    display: none;
}

.highlight-enter-active {
    animation: highlight 1s;
}

@keyframes highlight {
    from {
        background-color: rgba(255, 255, 255, 0.5);
    }

    to {
        background-color: rgba(255, 255, 255, 0);
    }
}
</style>
