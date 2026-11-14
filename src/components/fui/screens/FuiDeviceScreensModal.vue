<script
    lang="ts"
    setup
>
import { computed, onMounted, ref } from 'vue';
import Icon from '/src/components/layout/Icon.vue';

export interface Mps3FirmwareScreen {
    id: string;
    title: string;
    category: 'SEELE 01' | 'Player' | 'Connectivity' | 'Drawers' | 'System';
    description: string;
    width: number;
    height: number;
    sourceRef: string;
    cCode: string;
}

export interface DeviceImportPayload {
    title: string;
    cCode: string;
    overlay?: boolean;
}

const props = defineProps<{
    isOpen: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'importToCurrent', payload: DeviceImportPayload): void;
    (e: 'importAsNew', payload: DeviceImportPayload): void;
    (e: 'importAllFirmware', screens: Mps3FirmwareScreen[]): void;
}>();

const activeTab = ref<'firmware' | 'live'>('firmware');
const loadingCatalog = ref(false);
const catalogError = ref<string | null>(null);
const firmwareScreens = ref<Mps3FirmwareScreen[]>([]);
const selectedCategory = ref<string>('Todas');
const searchQuery = ref('');

const serialPort = ref('COM5');
const capturingLive = ref(false);
const liveError = ref<string | null>(null);
const liveCapture = ref<{
    port: string;
    pngDataUrl: string;
    cCode: string;
} | null>(null);

const categories = computed(() => {
    const unique = Array.from(new Set(firmwareScreens.value.map((s) => s.category)));
    return ['Todas', ...unique];
});

const filteredScreens = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    return firmwareScreens.value.filter((s) => {
        if (selectedCategory.value !== 'Todas' && s.category !== selectedCategory.value) {
            return false;
        }
        if (
            q &&
            !s.title.toLowerCase().includes(q) &&
            !s.description.toLowerCase().includes(q) &&
            !s.category.toLowerCase().includes(q)
        ) {
            return false;
        }
        return true;
    });
});

async function loadFirmwareCatalog() {
    loadingCatalog.value = true;
    catalogError.value = null;
    try {
        const res = await fetch('/api/mps3/firmware-screens');
        const data = await res.json();
        if (!data.ok) {
            throw new Error(data.error || 'Falha ao carregar catálogo MPS3');
        }
        firmwareScreens.value = data.screens || [];
    } catch (err: any) {
        catalogError.value = err?.message || 'Erro ao consultar /api/mps3/firmware-screens';
    } finally {
        loadingCatalog.value = false;
    }
}

async function handleLiveCapture() {
    capturingLive.value = true;
    liveError.value = null;
    try {
        const port = encodeURIComponent(serialPort.value.trim() || 'COM5');
        const res = await fetch(`/api/mps3/capture?port=${port}`);
        const data = await res.json();
        if (!data.ok) {
            liveError.value = data.error || 'Falha na captura UART.';
            return;
        }
        liveCapture.value = {
            port: data.port,
            pngDataUrl: data.pngDataUrl,
            cCode: data.cCode,
        };
    } catch (err: any) {
        liveError.value = err?.message || 'Erro de comunicação com o servidor Vite.';
    } finally {
        capturingLive.value = false;
    }
}

onMounted(() => {
    loadFirmwareCatalog();
});
</script>

<template>
    <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        @click.self="$emit('close')"
    >
        <div
            class="w-full max-w-4xl max-h-[86vh] flex flex-col rounded-xl border border-[#2b3144] bg-[#0f131d] text-gray-100 shadow-2xl overflow-hidden"
        >
            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b border-[#252b3d] bg-[#151a28]">
                <div class="flex items-center gap-2">
                    <Icon
                        type="chip"
                        class="text-[#00d8ff]"
                    />
                    <div>
                        <h3 class="font-semibold text-sm text-white leading-tight">
                            Importar Telas do Dispositivo MPS3
                        </h3>
                        <p class="text-[11px] text-gray-400">
                            Carregue layouts reais do firmware (`oled_display.c`) ou capture o display físico via UART
                            `@SCR`
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    class="btn btn-xs btn-ghost text-gray-400 hover:text-white"
                    @click="$emit('close')"
                >
                    ✕
                </button>
            </div>

            <!-- Tabs -->
            <div class="flex items-center justify-between px-4 pt-2 border-b border-[#252b3d] bg-[#111521]">
                <div class="flex gap-1">
                    <button
                        type="button"
                        class="px-3 py-2 text-xs font-medium border-b-2 transition-colors"
                        :class="
                            activeTab === 'firmware'
                                ? 'border-[#00d8ff] text-[#00d8ff]'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        "
                        @click="activeTab = 'firmware'"
                    >
                        Catálogo do Firmware ({{ firmwareScreens.length }})
                    </button>
                    <button
                        type="button"
                        class="px-3 py-2 text-xs font-medium border-b-2 transition-colors"
                        :class="
                            activeTab === 'live'
                                ? 'border-[#00d8ff] text-[#00d8ff]'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        "
                        @click="activeTab = 'live'"
                    >
                        Captura ao Vivo (UART)
                    </button>
                </div>

                <button
                    v-if="activeTab === 'firmware' && firmwareScreens.length > 0"
                    type="button"
                    class="btn btn-xs btn-outline border-[#00d8ff]/50 text-[#00d8ff] hover:bg-[#00d8ff] hover:text-black mb-1"
                    title="Adicionar todas as telas do firmware à lista de telas do projeto"
                    @click="$emit('importAllFirmware', firmwareScreens)"
                >
                    + Importar Todas ({{ firmwareScreens.length }})
                </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto p-4">
                <!-- Firmware Catalog Tab -->
                <template v-if="activeTab === 'firmware'">
                    <div class="flex flex-wrap items-center gap-2 mb-3">
                        <div class="flex flex-wrap gap-1 flex-1">
                            <button
                                v-for="cat in categories"
                                :key="cat"
                                type="button"
                                class="btn btn-xs"
                                :class="
                                    selectedCategory === cat
                                        ? 'bg-[#00d8ff] text-black border-[#00d8ff]'
                                        : 'btn-ghost border border-[#2b3144] text-gray-300'
                                "
                                @click="selectedCategory = cat"
                            >
                                {{ cat }}
                            </button>
                        </div>
                        <input
                            v-model="searchQuery"
                            type="text"
                            placeholder="Filtrar tela..."
                            class="input input-xs input-bordered bg-[#171c2b] border-[#2b3144] w-48"
                        />
                    </div>

                    <div
                        v-if="loadingCatalog"
                        class="py-12 text-center text-gray-400 text-xs"
                    >
                        Carregando telas de components/oled_display/oled_display.c...
                    </div>
                    <div
                        v-else-if="catalogError"
                        class="alert alert-warning text-xs"
                    >
                        <span>{{ catalogError }}</span>
                    </div>
                    <div
                        v-else
                        class="grid grid-cols-1 md:grid-cols-2 gap-3"
                    >
                        <div
                            v-for="item in filteredScreens"
                            :key="item.id"
                            class="rounded-lg border border-[#252b3d] bg-[#161b29] p-3 flex flex-col justify-between gap-2 hover:border-[#00d8ff]/50 transition-colors"
                        >
                            <div>
                                <div class="flex items-center justify-between gap-2 mb-1">
                                    <span class="font-mono text-xs font-semibold text-white">
                                        {{ item.title }}
                                    </span>
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-[10px] font-mono text-gray-400">
                                            {{ item.sourceRef }}
                                        </span>
                                        <span
                                            class="badge badge-xs bg-[#232a3e] text-[#00d8ff] border-0 font-medium"
                                        >
                                            {{ item.category }}
                                        </span>
                                    </div>
                                </div>
                                <p class="text-[11px] text-gray-400 leading-snug">
                                    {{ item.description }}
                                </p>
                            </div>

                            <div class="flex items-center justify-end gap-1.5 pt-2 border-t border-[#22283a]">
                                <button
                                    type="button"
                                    class="btn btn-xs btn-ghost border border-[#2b3144] text-gray-200 hover:border-[#00d8ff]"
                                    @click="$emit('importToCurrent', { title: item.title, cCode: item.cCode })"
                                >
                                    Na Tela Atual
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-xs bg-[#00d8ff] text-black border-0 hover:bg-[#33e0ff]"
                                    @click="$emit('importAsNew', { title: item.title, cCode: item.cCode })"
                                >
                                    + Como Nova Tela
                                </button>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- Live UART Capture Tab -->
                <template v-else>
                    <div class="flex flex-col gap-4">
                        <div
                            class="flex flex-wrap items-end gap-3 p-3 rounded-lg border border-[#252b3d] bg-[#161b29]"
                        >
                            <div class="flex flex-col gap-1">
                                <label class="text-[11px] text-gray-400">Porta Serial (MPS3)</label>
                                <input
                                    v-model="serialPort"
                                    type="text"
                                    placeholder="COM5"
                                    class="input input-sm input-bordered font-mono w-32 bg-[#0f131d] border-[#2b3144]"
                                />
                            </div>
                            <button
                                type="button"
                                class="btn btn-sm bg-[#00d8ff] text-black border-0 hover:bg-[#33e0ff]"
                                :disabled="capturingLive"
                                @click="handleLiveCapture"
                            >
                                <span
                                    v-if="capturingLive"
                                    class="loading loading-spinner loading-xs"
                                ></span>
                                {{ capturingLive ? 'Capturando (@SCR)...' : 'Capturar Display Agora' }}
                            </button>
                            <p class="text-[11px] text-gray-400 flex-1 min-w-[200px]">
                                Conecta com segurança (`dtr=False, rts=False`), lê o buffer 128×64 SSD1306 em tempo real e
                                converte para bitmap XBM editável no Lopaka.
                            </p>
                        </div>

                        <div
                            v-if="liveError"
                            class="alert alert-warning text-xs"
                        >
                            <span>{{ liveError }}</span>
                        </div>

                        <div
                            v-if="liveCapture"
                            class="rounded-lg border border-[#252b3d] bg-[#161b29] p-4 flex flex-col items-center gap-3"
                        >
                            <div class="text-xs text-gray-300 font-mono">
                                Capturado de {{ liveCapture.port }} (128×64 OLED)
                            </div>
                            <div class="p-2 rounded bg-[#0b0d13] border border-[#2b3144]">
                                <img
                                    :src="liveCapture.pngDataUrl"
                                    alt="MPS3 Live Capture"
                                    class="pixelated max-w-full"
                                    style="width: 512px; height: 256px"
                                />
                            </div>
                            <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
                                <button
                                    type="button"
                                    class="btn btn-xs bg-[#00d8ff] text-black border-0 hover:bg-[#33e0ff]"
                                    @click="
                                        $emit('importToCurrent', {
                                            title: 'mps3_live',
                                            cCode: liveCapture.cCode,
                                            overlay: false,
                                        })
                                    "
                                >
                                    Aplicar na Tela Atual (Editável)
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-xs btn-ghost border border-[#2b3144] text-gray-200 hover:border-[#00d8ff]"
                                    @click="
                                        $emit('importAsNew', {
                                            title: 'mps3_live',
                                            cCode: liveCapture.cCode,
                                            overlay: false,
                                        })
                                    "
                                >
                                    + Importar como Nova Tela
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-xs btn-ghost border border-amber-400/50 text-amber-300 hover:bg-amber-400 hover:text-black"
                                    title="Adiciona como camada de referência Overlay travada para redesenhar por cima"
                                    @click="
                                        $emit('importToCurrent', {
                                            title: 'mps3_ref_overlay',
                                            cCode: liveCapture.cCode,
                                            overlay: true,
                                        })
                                    "
                                >
                                    Usar como Guia (Overlay Travado)
                                </button>
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>
