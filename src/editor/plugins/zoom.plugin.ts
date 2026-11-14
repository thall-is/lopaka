import {nextTick, watch, WatchStopHandle} from 'vue';
import {SCALE_LIST} from '/src/const';
import {Session} from '../../core/session';
import {AbstractEditorPlugin} from './abstract-editor.plugin';
import {Point} from '../../core/point';

export class ZoomPlugin extends AbstractEditorPlugin {
    private panX = 0;
    private panY = 0;
    private canvasWrapper: HTMLElement | null = null;
    private scrollContainer: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private stopScaleWatch: WatchStopHandle | null = null;
    private stopDisplayWatch: WatchStopHandle | null = null;
    private isWheelZooming = false;
    private isMiddlePanning = false;
    private isPointerDown = false;
    private pendingResize = false;
    private hasUserPanned = false;
    private hasUserViewportAdjust = false;
    private lastContainerWidth = 0;
    private lastContainerHeight = 0;
    private lastPanClientX = 0;
    private lastPanClientY = 0;

    private boundMouseDown = (e: MouseEvent) => this.handleContainerMouseDown(e);
    private boundMouseMove = (e: MouseEvent) => this.handleMiddleMouseMove(e);
    private boundMouseUp = (e: MouseEvent) => this.handleGlobalMouseUp(e);
    private boundAuxClick = (e: MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
        }
    };
    private boundBlur = () => {
        this.isPointerDown = false;
        this.stopMiddlePan();
        this.flushPendingResize();
    };

    constructor(session: Session, container: HTMLElement) {
        super(session, container);
        this.init();
    }

    private getCanvasWrapper(): HTMLElement | null {
        if (!this.canvasWrapper) {
            this.canvasWrapper = this.container.closest('.canvas-wrapper');
        }
        return this.canvasWrapper;
    }

    private getScrollContainer(): HTMLElement | null {
        if (!this.scrollContainer) {
            this.scrollContainer = this.container.closest('.fui-editor__canvas');
        }
        return this.scrollContainer;
    }

    private init(): void {
        const sc = this.getScrollContainer();
        const cw = this.getCanvasWrapper();
        if (!sc || !cw) return;

        // Watch for external scale changes (slider, keyboard shortcuts)
        this.stopScaleWatch = watch(
            () => this.session.state.scaleIndex,
            (newIdx, oldIdx) => {
                if (this.isWheelZooming) return;
                if (oldIdx === undefined || newIdx === oldIdx) return;
                const ratio = SCALE_LIST[newIdx] / SCALE_LIST[oldIdx];
                nextTick(() => {
                    this.zoomToViewCenter(ratio);
                });
            },
            {flush: 'sync'}
        );

        this.stopDisplayWatch = watch(
            () => [this.session.state.display.x, this.session.state.display.y],
            ([newWidth, newHeight], [oldWidth, oldHeight]) => {
                if (newWidth === oldWidth && newHeight === oldHeight) return;
                nextTick(() => this.centerCanvas());
            },
            {flush: 'sync'}
        );

        this.lastContainerWidth = sc.clientWidth;
        this.lastContainerHeight = sc.clientHeight;

        // Watch for container resize (window resize)
        this.resizeObserver = new ResizeObserver(() => {
            this.handleContainerResize();
        });
        this.resizeObserver.observe(sc);

        // Initial centering after DOM is ready
        nextTick(() => this.centerCanvas());

        // Middle mouse button (scroll click) drag to pan canvas like BlinknBuild OLED Studio
        sc.addEventListener('mousedown', this.boundMouseDown, {capture: true});
        sc.addEventListener('auxclick', this.boundAuxClick);
        window.addEventListener('mousemove', this.boundMouseMove);
        window.addEventListener('mouseup', this.boundMouseUp);
        window.addEventListener('blur', this.boundBlur);
    }

    onWheel(event: WheelEvent): void {
        event.preventDefault();
        if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
            this.handlePan(event);
        } else if (event.deltaY === 0 && event.deltaX !== 0 && !event.ctrlKey && !event.metaKey) {
            this.handlePan(event);
        } else {
            this.handleZoom(event);
        }
    }

    private handleContainerMouseDown(event: MouseEvent): void {
        this.isPointerDown = true;
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        this.isMiddlePanning = true;
        this.lastPanClientX = event.clientX;
        this.lastPanClientY = event.clientY;
        const sc = this.getScrollContainer();
        if (sc) {
            sc.style.cursor = 'grabbing';
        }
    }

    private handleMiddleMouseMove(event: MouseEvent): void {
        if (!this.isMiddlePanning) return;
        if (typeof event.buttons === 'number' && event.buttons !== 0 && (event.buttons & 4) === 0) {
            this.stopMiddlePan();
            return;
        }
        event.preventDefault();
        const dx = event.clientX - this.lastPanClientX;
        const dy = event.clientY - this.lastPanClientY;
        this.lastPanClientX = event.clientX;
        this.lastPanClientY = event.clientY;
        this.panX += dx;
        this.panY += dy;
        this.hasUserPanned = true;
        this.hasUserViewportAdjust = true;
        this.clampFreePan();
        this.applyTransform();
    }

    private handleGlobalMouseUp(event: MouseEvent): void {
        if (this.isPointerDown) {
            this.isPointerDown = false;
            this.flushPendingResize();
        }
        if (!this.isMiddlePanning) return;
        if (event.button === 1 || event.type === 'mouseup') {
            this.stopMiddlePan();
        }
    }

    private handleContainerResize(): void {
        const sc = this.getScrollContainer();
        if (!sc) return;

        const newW = sc.clientWidth;
        const newH = sc.clientHeight;
        if (newW === this.lastContainerWidth && newH === this.lastContainerHeight) {
            return;
        }

        if (this.isPointerDown) {
            // Defer resize reaction until pointer interaction ends so clicking/dragging a layer
            // never shifts the canvas underneath the cursor.
            this.pendingResize = true;
            return;
        }

        this.applyContainerResize(newW, newH);
    }

    private flushPendingResize(): void {
        if (!this.pendingResize) return;
        this.pendingResize = false;
        const sc = this.getScrollContainer();
        if (!sc) return;
        this.applyContainerResize(sc.clientWidth, sc.clientHeight);
    }

    private applyContainerResize(newW: number, newH: number): void {
        const prevW = this.lastContainerWidth;
        const prevH = this.lastContainerHeight;
        this.lastContainerWidth = newW;
        this.lastContainerHeight = newH;

        if (!this.hasUserViewportAdjust) {
            this.centerCanvas();
            return;
        }

        if (prevW > 0 && prevH > 0) {
            this.panX += (newW - prevW) / 2;
            this.panY += (newH - prevH) / 2;
        }
        if (this.hasUserPanned) {
            this.clampFreePan();
        } else {
            this.clampPan();
        }
        this.applyTransform();
    }

    private stopMiddlePan(): void {
        if (!this.isMiddlePanning) return;
        this.isMiddlePanning = false;
        const sc = this.getScrollContainer();
        if (sc) {
            sc.style.cursor = '';
        }
    }

    private lastZoomTime = 0;

    /**
     * Current pan offset (in CSS pixels) applied to the canvas wrapper.
     * Exposed so other editor components (e.g. viewport-relative placement)
     * can reuse the already-tracked pan state instead of re-deriving it
     * from the DOM transform.
     */
    getPan(): Point {
        return new Point(this.panX, this.panY);
    }

    /**
     * Size of the visible scroll viewport (in CSS pixels), or null when the
     * DOM has not been wired up yet (e.g. in unit tests without a container).
     */
    getViewportSize(): Point | null {
        const sc = this.getScrollContainer();
        if (!sc) return null;
        return new Point(sc.clientWidth, sc.clientHeight);
    }

    private handleZoom(event: WheelEvent): void {
        const sc = this.getScrollContainer();
        const cw = this.getCanvasWrapper();
        if (!sc || !cw) return;

        const now = Date.now();
        if (now - this.lastZoomTime < 25) {
            return;
        }

        const oldPercent = this.session.getScalePercent();

        this.isWheelZooming = true;
        if (event.deltaY < 0) {
            this.session.scaleUp();
        } else if (event.deltaY > 0) {
            this.session.scaleDown();
        }

        this.lastZoomTime = now;

        const newPercent = this.session.getScalePercent();
        if (newPercent === oldPercent) {
            this.isWheelZooming = false;
            return;
        }

        const ratio = newPercent / oldPercent;
        const scRect = sc.getBoundingClientRect();

        // Cursor position relative to scroll container
        let mouseX = event.clientX - scRect.left;
        let mouseY = event.clientY - scRect.top;

        // Check if cursor is over the canvas
        const cwRect = cw.getBoundingClientRect();
        const isOverCanvas =
            event.clientX >= cwRect.left &&
            event.clientX <= cwRect.right &&
            event.clientY >= cwRect.top &&
            event.clientY <= cwRect.bottom;

        if (!isOverCanvas) {
            mouseX = sc.clientWidth / 2;
            mouseY = sc.clientHeight / 2;
        }

        // Focal-point zoom: keep the point under cursor fixed
        const newPanX = mouseX - (mouseX - this.panX) * ratio;
        const newPanY = mouseY - (mouseY - this.panY) * ratio;

        nextTick(() => {
            this.panX = newPanX;
            this.panY = newPanY;
            this.hasUserViewportAdjust = true;
            if (this.hasUserPanned) {
                this.clampFreePan();
            } else {
                this.clampPan();
            }
            this.applyTransform();
            this.isWheelZooming = false;
        });
    }

    private handlePan(event: WheelEvent): void {
        this.panX -= event.deltaX;
        this.panY -= event.deltaY;
        this.hasUserViewportAdjust = true;
        this.clampPan();
        this.applyTransform();
    }

    private zoomToViewCenter(ratio: number): void {
        const sc = this.getScrollContainer();
        if (!sc) return;

        const centerX = sc.clientWidth / 2;
        const centerY = sc.clientHeight / 2;

        this.panX = centerX - (centerX - this.panX) * ratio;
        this.panY = centerY - (centerY - this.panY) * ratio;
        if (this.hasUserPanned) {
            this.clampFreePan();
        } else {
            this.clampPan();
        }
        this.applyTransform();
    }

    private centerCanvas(): void {
        const sc = this.getScrollContainer();
        const cw = this.getCanvasWrapper();
        if (!sc || !cw) return;

        const containerW = sc.clientWidth;
        const containerH = sc.clientHeight;
        const canvasW = cw.offsetWidth;
        const canvasH = cw.offsetHeight;

        this.hasUserPanned = false;
        this.hasUserViewportAdjust = false;
        this.panX = (containerW - canvasW) / 2;
        this.panY = (containerH - canvasH) / 2;
        this.applyTransform();
    }

    private clampFreePan(): void {
        const sc = this.getScrollContainer();
        const cw = this.getCanvasWrapper();
        if (!sc || !cw) return;

        const containerW = sc.clientWidth;
        const containerH = sc.clientHeight;
        const canvasW = cw.offsetWidth;
        const canvasH = cw.offsetHeight;

        const minVisibleX = Math.min(containerW / 2, Math.max(48, canvasW / 3));
        const minVisibleY = Math.min(containerH / 2, Math.max(48, canvasH / 3));
        this.panX = Math.max(-(canvasW - minVisibleX), Math.min(containerW - minVisibleX, this.panX));
        this.panY = Math.max(-(canvasH - minVisibleY), Math.min(containerH - minVisibleY, this.panY));
    }

    private clampPan(): void {
        const sc = this.getScrollContainer();
        const cw = this.getCanvasWrapper();
        if (!sc || !cw) return;

        const containerW = sc.clientWidth;
        const containerH = sc.clientHeight;
        const canvasW = cw.offsetWidth;
        const canvasH = cw.offsetHeight;

        if (canvasW <= containerW) {
            // Canvas fits — center it
            this.panX = (containerW - canvasW) / 2;
        } else {
            // Canvas overflows — keep at least some visible
            const minVisible = containerW / 2;
            this.panX = Math.max(-(canvasW - minVisible), Math.min(containerW - minVisible, this.panX));
        }

        if (canvasH <= containerH) {
            this.panY = (containerH - canvasH) / 2;
        } else {
            const minVisible = containerH / 2;
            this.panY = Math.max(-(canvasH - minVisible), Math.min(containerH - minVisible, this.panY));
        }
    }

    private applyTransform(): void {
        const cw = this.getCanvasWrapper();
        if (!cw) return;
        cw.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
    }

    onDestroy(): void {
        this.stopMiddlePan();
        if (this.scrollContainer) {
            this.scrollContainer.removeEventListener('mousedown', this.boundMouseDown, {capture: true});
            this.scrollContainer.removeEventListener('auxclick', this.boundAuxClick);
        }
        window.removeEventListener('mousemove', this.boundMouseMove);
        window.removeEventListener('mouseup', this.boundMouseUp);
        window.removeEventListener('blur', this.boundBlur);
        if (this.stopScaleWatch) {
            this.stopScaleWatch();
            this.stopScaleWatch = null;
        }
        if (this.stopDisplayWatch) {
            this.stopDisplayWatch();
            this.stopDisplayWatch = null;
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }
}
