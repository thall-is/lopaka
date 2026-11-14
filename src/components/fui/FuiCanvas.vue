<script lang="ts" setup>
import {computed, onBeforeUnmount, onMounted, ref, toRefs} from 'vue';
import {useSession} from '../../core/session';

const props = defineProps<{
    readonly?: Boolean;
}>();

const screen = ref(null);
const container = ref(null);
const session = useSession();
const {editor, virtualScreen, state} = session;
const {display, scale, lock, platform, immidiateUpdates} = toRefs(state);
const {activeTool} = toRefs(editor.state);

const platformFeatures = computed(() => session.getPlatformFeatures(platform.value));
const screenBackground = computed(() => {
    // Platform feature objects are shared plain objects. Depend on the
    // session mutation counter so WebMCP feature updates invalidate this CSS.
    immidiateUpdates.value;
    const baseBg = platformFeatures.value?.screenBgColor ?? '#000000';
    if (
        state.grid.enabled &&
        state.grid.colorMode === 'studio' &&
        baseBg.toLowerCase() === '#000000'
    ) {
        return '#232634';
    }
    return baseBg;
});

onMounted(() => {
    virtualScreen.setCanvas(screen.value);
    editor.setContainer(container.value as HTMLElement);
    document.addEventListener('mouseup', handleEvent);
    document.addEventListener('touchend', handleEvent);
    document.addEventListener('keydown', handleEvent);
    document.addEventListener('keyup', handleEvent);
});

onBeforeUnmount(() => {
    editor.destroy();
    document.removeEventListener('mouseup', handleEvent);
    document.removeEventListener('touchend', handleEvent);
    document.removeEventListener('keydown', handleEvent);
    document.removeEventListener('keyup', handleEvent);
});

function handleEvent(e) {
    if (!props.readonly) {
        editor.handleEvent(e);
    }
}

function isSelectTool() {
    return !activeTool.value;
}

function isDrawingTool() {
    // Treat text-based tools as type tools rather than drawing tools.
    return activeTool.value && !isTextTool();
}

function isTextTool() {
    // Match both plain text and text area tools for text cursor styling.
    return activeTool.value && ['string', 'textarea'].includes(activeTool.value.getName());
}

const canvasClassNames = computed(() => {
    return {
        'fui-canvas_select': isSelectTool(),
        'fui-canvas_draw': isDrawingTool(),
        'fui-canvas_type': isTextTool(),
    };
});
</script>
<template>
    <div
        class="canvas-wrapper"
        :class="{locked: lock}"
    >
        <div class="fui-grid">
            <div
                ref="container"
                class="relative"
                :class="canvasClassNames"
                @mousedown.prevent="editor.handleEvent"
                @mousemove.prevent="handleEvent"
                @mouseleave.prevent="handleEvent"
                @touchstart.prevent="handleEvent"
                @touchend.prevent="handleEvent"
                @touchmove.prevent="handleEvent"
                @dblclick.prevent="handleEvent"
                @click.prevent="handleEvent"
                @dragenter.prevent
                @dragover.prevent
                @drop.prevent="handleEvent"
                @contextmenu.prevent
            >
                <canvas
                    ref="screen"
                    class="screen"
                    :class="{
                        screen_smooth: platformFeatures?.smooth,
                    }"
                    :width="display.x"
                    :height="display.y"
                    :style="{
                        width: display.x * scale.x + 'px',
                        height: display.y * scale.y + 'px',
                        backgroundColor: screenBackground,
                    }"
                />
            </div>
        </div>
    </div>
</template>
<style lang="css">
.canvas-wrapper {
    display: inline-block;
    font-size: 0;
    position: absolute;
    left: 0;
    top: 0;
    background-color: #0b0d13;
    height: fit-content;
    border: 8px solid #141722;
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.65);
    transform-origin: 0 0;
    will-change: transform;
}

.fui-canvas__event-target {
    position: relative;
    overflow: visible;
}

.fui-canvas__selection {
    position: absolute;
    border: 2px dashed #ffffff70;
    background-color: #ffffff10;
    box-sizing: content-box;
    z-index: 2;
    pointer-events: none;
    display: none;
    translate: transform(-50%, -50%);
}

.locked {
    opacity: 0.5;
    cursor: wait !important;
    pointer-events: none !important;
}

.screen {
    image-rendering: pixelated;
    background: black;
    text-rendering: geometricPrecision;
    font-smooth: never;
    -webkit-font-smoothing: none;
}

.screen_smooth {
    image-rendering: auto;
    text-rendering: auto;
    font-smooth: auto;
    -webkit-font-smoothing: auto;
}

.fui-grid {
    box-sizing: content-box;
    position: relative;
    background-color: #0b0d13;
    border: 1px solid #2b3144;
}

.fui-canvas_select {
    cursor: default;
}

.fui-canvas_draw {
    cursor: crosshair;
}

.fui-canvas_type {
    cursor: text;
}
</style>
