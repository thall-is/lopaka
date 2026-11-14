<script
    lang="ts"
    setup
>
import { computed, onMounted, onUnmounted } from 'vue';
import Button from '/src/components/layout/Button.vue';
import Icon from '/src/components/layout/Icon.vue';
import { TGridSettings, useSession } from '/src/core/session';

const session = useSession();
const grid = computed(() => session.state.grid);

const coordinateLabel = computed(() => {
    const hover = session.state.hoverPixel;
    const zoomPct = Math.round(session.state.scale.x * 100);
    if (hover) {
        return `Pos: ${hover.x},${hover.y} · ${zoomPct}%`;
    }
    return `${session.state.display.x}×${session.state.display.y} · ${zoomPct}%`;
});

const subdivisionOptions = [
    { label: 'Off', value: 0 },
    { label: '8px', value: 8 },
    { label: '10px', value: 10 },
    { label: '16px', value: 16 },
];

const colorOptions: Array<{ label: string; value: TGridSettings['colorMode'] }> = [
    { label: 'Studio (Blinkn)', value: 'studio' },
    { label: 'Cyan', value: 'cyan' },
    { label: 'Amber', value: 'amber' },
    { label: 'Contrast', value: 'contrast' },
    { label: 'White', value: 'white' },
];

function updateOpacity(event: Event) {
    const target = event.target as HTMLInputElement;
    const val = parseFloat(target.value);
    if (!Number.isNaN(val)) {
        session.setGridSettings({ opacity: val });
    }
}

function handleKeyDown(event: KeyboardEvent) {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
    }
    if (event.altKey && event.code === 'KeyG') {
        event.preventDefault();
        session.toggleGrid();
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
});
</script>
<template>
    <div class="flex flex-row items-center gap-1.5">
        <div
            class="px-2 py-1 rounded bg-base-200 border border-secondary font-mono text-[11px] leading-none min-w-[116px] text-center select-none"
            :class="session.state.hoverPixel ? 'text-[#00d8ff]' : 'text-gray-400'"
            title="Posição do pixel (X,Y) e Zoom — Scroll: Zoom | Clique no Scroll + Arraste: Mover"
        >
            {{ coordinateLabel }}
        </div>
        <Button
            xs
            filled
            secondary
            :noFocus="true"
            :active="grid.enabled"
            :class="{ 'text-black': grid.enabled }"
            title="Toggle Pixel Grid (Alt+G)"
            @click="session.toggleGrid()"
        >
            <Icon
                type="grid"
                sm
                :primary="!grid.enabled"
                :class="{ 'text-black': grid.enabled }"
            />
            <span class="ml-1 text-[11px]">Grid</span>
        </Button>
        <div class="dropdown dropdown-end">
            <div
                tabindex="0"
                role="button"
                class="btn btn-xs btn-square btn-ghost border border-secondary"
                title="Grid Settings"
            >
                <Icon
                    type="cog"
                    sm
                />
            </div>
            <div
                tabindex="0"
                class="dropdown-content z-50 menu p-3 shadow-lg bg-base-200 rounded-box w-64 text-xs gap-2.5 border border-secondary mt-1"
            >
                <div class="flex items-center justify-between font-semibold text-primary border-b border-secondary pb-1">
                    <span>Pixel Grid Settings</span>
                    <span class="text-[10px] text-gray-400 font-normal">Alt+G</span>
                </div>

                <label class="flex items-center justify-between cursor-pointer">
                    <span>Show Pixel Grid</span>
                    <input
                        type="checkbox"
                        class="checkbox checkbox-xs checkbox-primary"
                        :checked="grid.enabled"
                        @change="session.setGridSettings({ enabled: ($event.target as HTMLInputElement).checked })"
                    />
                </label>

                <div class="flex flex-col gap-1">
                    <span class="text-gray-400">Subdivision (Major Lines)</span>
                    <div class="join w-full">
                        <button
                            v-for="opt in subdivisionOptions"
                            :key="opt.value"
                            type="button"
                            class="btn btn-xs join-item flex-1"
                            :class="grid.subdivision === opt.value ? 'btn-primary text-black' : 'btn-ghost border border-secondary'"
                            @click="session.setGridSettings({ subdivision: opt.value })"
                        >
                            {{ opt.label }}
                        </button>
                    </div>
                </div>

                <label class="flex items-center justify-between cursor-pointer">
                    <span>Center Crosshair (W/2, H/2)</span>
                    <input
                        type="checkbox"
                        class="checkbox checkbox-xs checkbox-primary"
                        :checked="grid.showCenter"
                        @change="session.setGridSettings({ showCenter: ($event.target as HTMLInputElement).checked })"
                    />
                </label>

                <label class="flex items-center justify-between cursor-pointer">
                    <span>Highlight Cursor Pixel</span>
                    <input
                        type="checkbox"
                        class="checkbox checkbox-xs checkbox-primary"
                        :checked="grid.showHoverPixel"
                        @change="session.setGridSettings({ showHoverPixel: ($event.target as HTMLInputElement).checked })"
                    />
                </label>

                <div class="flex flex-col gap-1">
                    <span class="text-gray-400">Grid Color</span>
                    <div class="grid grid-cols-2 gap-1">
                        <button
                            v-for="c in colorOptions"
                            :key="c.value"
                            type="button"
                            class="btn btn-xs"
                            :class="grid.colorMode === c.value ? 'btn-primary text-black' : 'btn-ghost border border-secondary'"
                            @click="session.setGridSettings({ colorMode: c.value })"
                        >
                            {{ c.label }}
                        </button>
                    </div>
                </div>

                <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between text-gray-400">
                        <span>Grid Opacity</span>
                        <span class="font-mono">{{ Math.round(grid.opacity * 100) }}%</span>
                    </div>
                    <input
                        type="range"
                        class="range range-xs range-primary"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        :value="grid.opacity"
                        @input="updateOpacity"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
<style lang="css"></style>
