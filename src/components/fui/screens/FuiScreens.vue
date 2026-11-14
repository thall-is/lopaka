<script
    lang="ts"
    setup
>
import { nextTick, ref } from 'vue';
import Icon from '/src/components/layout/Icon.vue';
import { ProjectScreen } from '/src/types';

const props = defineProps<{
    screens: ProjectScreen[];
    activeScreenId: number;
    readonly?: boolean;
}>();

const emit = defineEmits<{
    (e: 'select', screenId: number): void;
    (e: 'add'): void;
    (e: 'duplicate', screenId: number): void;
    (e: 'rename', screenId: number, title: string): void;
    (e: 'remove', screenId: number): void;
    (e: 'move', screenId: number, delta: -1 | 1): void;
    (e: 'exportProject'): void;
    (e: 'exportCurrentScreen'): void;
    (e: 'exportScreen', screenId: number): void;
    (e: 'importProject', file: File): void;
    (e: 'importScreenAsNew', file: File): void;
    (e: 'openDeviceModal'): void;
    (e: 'copyAllCode'): void;
}>();

const editingId = ref<number | null>(null);
const editingTitle = ref('');
const renameInputRef = ref<HTMLInputElement[] | HTMLInputElement | null>(null);

function startRename(screen: ProjectScreen) {
    if (props.readonly) return;
    editingId.value = screen.id;
    editingTitle.value = screen.title || `screen_${screen.id}`;
    nextTick(() => {
        const el = Array.isArray(renameInputRef.value) ? renameInputRef.value[0] : renameInputRef.value;
        el?.focus();
        el?.select();
    });
}

function commitRename(screen: ProjectScreen) {
    if (editingId.value !== screen.id) return;
    const trimmed = editingTitle.value.trim();
    editingId.value = null;
    if (trimmed && trimmed !== screen.title) {
        emit('rename', screen.id, trimmed);
    }
}

function cancelRename() {
    editingId.value = null;
}

function onImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
        emit('importProject', file);
    }
    input.value = '';
}

function onImportAsNewFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
        emit('importScreenAsNew', file);
    }
    input.value = '';
}
</script>

<template>
    <div class="flex flex-col border-b border-secondary">
        <div class="flex items-center justify-between px-2 py-1.5 border-b border-secondary bg-base-200/40">
            <div class="flex items-center gap-1.5 min-w-0">
                <Icon
                    type="screens"
                    sm
                    class="text-primary flex-shrink-0"
                />
                <span class="font-semibold text-xs uppercase tracking-wider truncate">
                    Screens ({{ screens.length }})
                </span>
            </div>
            <div class="flex items-center gap-0.5 flex-shrink-0">
                <button
                    v-if="!readonly"
                    type="button"
                    class="btn btn-xs btn-ghost px-1 min-h-0 h-6 text-primary font-bold text-sm"
                    title="New Screen"
                    @click="$emit('add')"
                >
                    +
                </button>
                <button
                    type="button"
                    class="btn btn-xs btn-ghost px-1 min-h-0 h-6"
                    title="Copy C/C++ code of all screens"
                    @click="$emit('copyAllCode')"
                >
                    <Icon
                        type="clipboard"
                        xs
                    />
                </button>
                <button
                    type="button"
                    class="btn btn-xs btn-ghost px-1 min-h-0 h-6"
                    title="Exportar Todas as Telas (.lopaka.json)"
                    @click="$emit('exportProject')"
                >
                    <Icon
                        type="folder-download"
                        xs
                    />
                </button>
            </div>
        </div>

        <div
            v-if="!readonly"
            class="grid grid-cols-2 gap-1 px-1.5 py-1.5 border-b border-secondary bg-base-200/20"
        >
            <button
                type="button"
                class="btn btn-xs h-6 min-h-0 px-1.5 gap-1 bg-base-200 hover:bg-base-300 border border-secondary text-[10px] font-medium justify-start"
                title="Exportar somente a tela de trabalho atual (.lopaka-screen.json)"
                @click="$emit('exportCurrentScreen')"
            >
                <Icon
                    type="export-file"
                    xs
                    class="text-[#00d8ff]"
                />
                <span class="truncate">Exportar Tela</span>
            </button>

            <label
                class="btn btn-xs h-6 min-h-0 px-1.5 gap-1 bg-base-200 hover:bg-base-300 border border-secondary text-[10px] font-medium justify-start cursor-pointer"
                title="Importar tela salva (.lopaka-screen.json) para a tela de trabalho atual ou projeto (.lopaka.json)"
            >
                <input
                    type="file"
                    accept=".json,.lopaka.json,.lopaka-screen.json"
                    class="hidden"
                    @change="onImportFile"
                />
                <Icon
                    type="folder-open"
                    xs
                    class="text-[#00d8ff]"
                />
                <span class="truncate">Importar Tela</span>
            </label>

            <label
                class="btn btn-xs h-6 min-h-0 px-1.5 gap-1 bg-base-200 hover:bg-base-300 border border-secondary text-[10px] font-medium justify-start cursor-pointer"
                title="Importar arquivo .lopaka-screen.json como uma nova tela na lista"
            >
                <input
                    type="file"
                    accept=".json,.lopaka.json,.lopaka-screen.json"
                    class="hidden"
                    @change="onImportAsNewFile"
                />
                <Icon
                    type="plus"
                    xs
                    class="text-primary"
                />
                <span class="truncate">+ Nova de Arq.</span>
            </label>

            <button
                type="button"
                class="btn btn-xs h-6 min-h-0 px-1.5 gap-1 bg-[#162235] hover:bg-[#1f314d] border border-[#00d8ff]/40 text-[#00d8ff] text-[10px] font-medium justify-start"
                title="Importar telas do dispositivo MPS3 (firmware oled_display.c ou captura ao vivo UART)"
                @click="$emit('openDeviceModal')"
            >
                <Icon
                    type="chip"
                    xs
                />
                <span class="truncate">Telas MPS3</span>
            </button>
        </div>

        <div class="max-h-[32vh] overflow-y-auto px-1 py-1 flex flex-col gap-1">
            <div
                v-for="(screen, idx) in screens"
                :key="screen.id"
                class="group cursor-pointer rounded p-1.5 flex items-center gap-2 border transition-colors"
                :class="
                    screen.id === activeScreenId
                        ? 'border-primary bg-base-300'
                        : 'border-transparent hover:bg-base-200'
                "
                @click="$emit('select', screen.id)"
            >
                <div
                    class="w-12 h-6 bg-black border border-neutral-700 rounded-sm overflow-hidden flex-shrink-0 flex items-center justify-center"
                >
                    <img
                        v-if="screen.img_preview"
                        :src="screen.img_preview"
                        class="w-full h-full object-contain pixelated"
                        :alt="screen.title || `screen_${screen.id}`"
                    />
                    <span
                        v-else
                        class="text-[9px] text-neutral-600 font-mono"
                    >
                        {{ idx + 1 }}
                    </span>
                </div>

                <div
                    class="min-w-0 flex-1"
                    @dblclick.stop="startRename(screen)"
                >
                    <input
                        v-if="editingId === screen.id"
                        ref="renameInputRef"
                        v-model="editingTitle"
                        type="text"
                        class="input input-xs input-bordered w-full px-1 h-5 text-xs"
                        @click.stop
                        @keydown.enter.prevent="commitRename(screen)"
                        @keydown.escape.prevent="cancelRename"
                        @blur="commitRename(screen)"
                    />
                    <template v-else>
                        <div
                            class="truncate text-xs font-medium leading-tight"
                            :class="screen.id === activeScreenId ? 'text-primary' : 'text-gray-200'"
                            :title="screen.title || `screen_${screen.id}`"
                        >
                            {{ screen.title || `screen_${screen.id}` }}
                        </div>
                        <div class="text-[10px] text-gray-500 leading-tight">
                            {{ (screen.layers || []).length }} layers
                        </div>
                    </template>
                </div>

                <div
                    v-if="!readonly && editingId !== screen.id"
                    class="hidden group-hover:flex items-center gap-0.5 flex-shrink-0"
                >
                    <button
                        v-if="idx > 0"
                        type="button"
                        class="btn btn-xs btn-ghost px-0.5 min-h-0 h-5"
                        title="Move Up"
                        @click.stop="$emit('move', screen.id, -1)"
                    >
                        <Icon
                            type="chevron-up"
                            xs
                        />
                    </button>
                    <button
                        v-if="idx < screens.length - 1"
                        type="button"
                        class="btn btn-xs btn-ghost px-0.5 min-h-0 h-5"
                        title="Move Down"
                        @click.stop="$emit('move', screen.id, 1)"
                    >
                        <Icon
                            type="collapse"
                            xs
                        />
                    </button>
                    <button
                        type="button"
                        class="btn btn-xs btn-ghost px-0.5 min-h-0 h-5"
                        title="Rename Screen"
                        @click.stop="startRename(screen)"
                    >
                        <Icon
                            type="edit"
                            xs
                        />
                    </button>
                    <button
                        type="button"
                        class="btn btn-xs btn-ghost px-0.5 min-h-0 h-5"
                        title="Exportar esta tela (.lopaka-screen.json)"
                        @click.stop="$emit('exportScreen', screen.id)"
                    >
                        <Icon
                            type="export-file"
                            xs
                        />
                    </button>
                    <button
                        type="button"
                        class="btn btn-xs btn-ghost px-0.5 min-h-0 h-5"
                        title="Duplicate Screen"
                        @click.stop="$emit('duplicate', screen.id)"
                    >
                        <Icon
                            type="clone"
                            xs
                        />
                    </button>
                    <button
                        v-if="screens.length > 1"
                        type="button"
                        class="btn btn-xs btn-ghost text-error px-1 min-h-0 h-5 leading-none"
                        title="Delete Screen"
                        @click.stop="$emit('remove', screen.id)"
                    >
                        ×
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
