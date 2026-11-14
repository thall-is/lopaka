import { DEFAULT_GRID_SETTINGS, TGridSettings } from '../../core/session';
import { Point } from '../../core/point';
import { DrawPlugin } from './draw.plugin';

type GridPalette = {
    minor: (opacity: number) => string;
    major: (opacity: number) => string;
    center: (opacity: number) => string;
    minorWidth: (scaleX: number) => number;
    majorWidth: (scaleX: number) => number;
    hoverStroke: string;
    hoverFill?: string;
};

const PALETTES: Record<TGridSettings['colorMode'], GridPalette> = {
    studio: {
        // BlinknBuild OLED Pixel Studio: crisp dark trenches separating #232634 OFF tiles and #ffffff ON pixels
        minor: (a) => `rgba(11, 13, 20, ${Math.min(1, Math.max(0.55, a))})`,
        major: (a) => `rgba(5, 7, 12, ${Math.min(1, Math.max(0.75, a + 0.12))})`,
        center: (a) => `rgba(0, 216, 255, ${Math.min(1, a * 0.75)})`,
        minorWidth: (sx) => (sx >= 6 ? 0.65 : 0.5),
        majorWidth: (sx) => (sx >= 6 ? 0.85 : 0.7),
        hoverStroke: '#00d8ff',
        hoverFill: 'rgba(0, 216, 255, 0.08)',
    },
    cyan: {
        minor: (a) => `rgba(0, 229, 255, ${a})`,
        major: (a) => `rgba(0, 229, 255, ${Math.min(1, a * 1.9)})`,
        center: (a) => `rgba(255, 130, 0, ${Math.min(1, a * 2.2)})`,
        minorWidth: () => 0.5,
        majorWidth: () => 0.75,
        hoverStroke: '#ff8200',
    },
    amber: {
        minor: (a) => `rgba(255, 145, 0, ${a})`,
        major: (a) => `rgba(255, 145, 0, ${Math.min(1, a * 1.9)})`,
        center: (a) => `rgba(0, 229, 255, ${Math.min(1, a * 2.2)})`,
        minorWidth: () => 0.5,
        majorWidth: () => 0.75,
        hoverStroke: '#00e5ff',
    },
    contrast: {
        minor: (a) => `rgba(148, 163, 184, ${a})`,
        major: (a) => `rgba(148, 163, 184, ${Math.min(1, a * 1.9)})`,
        center: (a) => `rgba(255, 130, 0, ${Math.min(1, a * 2.2)})`,
        minorWidth: () => 0.5,
        majorWidth: () => 0.75,
        hoverStroke: '#00e5ff',
    },
    white: {
        minor: (a) => `rgba(255, 255, 255, ${a})`,
        major: (a) => `rgba(255, 255, 255, ${Math.min(1, a * 1.9)})`,
        center: (a) => `rgba(255, 130, 0, ${Math.min(1, a * 2.2)})`,
        minorWidth: () => 0.5,
        majorWidth: () => 0.75,
        hoverStroke: '#00e5ff',
    },
};

export class GridPlugin extends DrawPlugin {
    private mouseOverCanvas: boolean = false;

    public update(ctx: CanvasRenderingContext2D, point: Point | null, event: MouseEvent | TouchEvent | null): void {
        if (event) {
            switch (event.type) {
                case 'mousemove':
                case 'touchmove':
                case 'mouseenter':
                case 'touchstart':
                    this.mouseOverCanvas = true;
                    break;
                case 'mouseleave':
                case 'touchend':
                case 'touchcancel':
                    this.mouseOverCanvas = false;
                    break;
            }
        }

        const { scale, display } = this.session.state;
        const grid: TGridSettings = this.session.state.grid ?? DEFAULT_GRID_SETTINGS;

        if (point && this.mouseOverCanvas) {
            const px = Math.floor(point.x / scale.x);
            const py = Math.floor(point.y / scale.y);
            if (px >= 0 && px < display.x && py >= 0 && py < display.y) {
                const prev = this.session.state.hoverPixel;
                if (!prev || prev.x !== px || prev.y !== py) {
                    this.session.state.hoverPixel = { x: px, y: py };
                }
            } else if (this.session.state.hoverPixel !== null) {
                this.session.state.hoverPixel = null;
            }
        } else if (this.session.state.hoverPixel !== null) {
            this.session.state.hoverPixel = null;
        }

        const canvasW = display.x * scale.x;
        const canvasH = display.y * scale.y;
        const palette = PALETTES[grid.colorMode] ?? PALETTES.studio;
        const sub = grid.subdivision > 0 ? grid.subdivision : 0;
        const centerX = Math.floor(display.x / 2);
        const centerY = Math.floor(display.y / 2);

        if (grid.enabled) {
            // Minor 1px grid (visible from 2x zoom and above)
            if (scale.x >= 2 && scale.y >= 2) {
                ctx.save();
                ctx.beginPath();
                for (let x = 1; x < display.x; x++) {
                    if ((sub > 0 && x % sub === 0) || (grid.showCenter && x === centerX)) {
                        continue;
                    }
                    const cx = x * scale.x + 0.5;
                    ctx.moveTo(cx, 0);
                    ctx.lineTo(cx, canvasH);
                }
                for (let y = 1; y < display.y; y++) {
                    if ((sub > 0 && y % sub === 0) || (grid.showCenter && y === centerY)) {
                        continue;
                    }
                    const cy = y * scale.y + 0.5;
                    ctx.moveTo(0, cy);
                    ctx.lineTo(canvasW, cy);
                }
                ctx.strokeStyle = palette.minor(grid.opacity);
                ctx.lineWidth = palette.minorWidth(scale.x);
                ctx.stroke();
                ctx.restore();
            }

            // Major subdivision grid (e.g. 8px SSD1306 pages/bytes, 10px, 16px)
            if (sub > 0) {
                ctx.save();
                ctx.beginPath();
                for (let x = sub; x < display.x; x += sub) {
                    if (grid.showCenter && x === centerX) {
                        continue;
                    }
                    const cx = x * scale.x + 0.5;
                    ctx.moveTo(cx, 0);
                    ctx.lineTo(cx, canvasH);
                }
                for (let y = sub; y < display.y; y += sub) {
                    if (grid.showCenter && y === centerY) {
                        continue;
                    }
                    const cy = y * scale.y + 0.5;
                    ctx.moveTo(0, cy);
                    ctx.lineTo(canvasW, cy);
                }
                ctx.strokeStyle = palette.major(grid.opacity);
                ctx.lineWidth = palette.majorWidth(scale.x);
                ctx.stroke();
                ctx.restore();
            }

            // Center crosshair guides (W/2, H/2)
            if (grid.showCenter) {
                ctx.save();
                ctx.beginPath();
                const midX = centerX * scale.x + 0.5;
                const midY = centerY * scale.y + 0.5;
                ctx.moveTo(midX, 0);
                ctx.lineTo(midX, canvasH);
                ctx.moveTo(0, midY);
                ctx.lineTo(canvasW, midY);
                ctx.setLineDash([2, 2]);
                ctx.strokeStyle = palette.center(grid.opacity);
                ctx.lineWidth = 0.75;
                ctx.stroke();
                ctx.restore();
            }
        }

        // Hovered pixel cell highlight (BlinknBuild cyan cell outline)
        const hover = this.session.state.hoverPixel;
        if (grid.showHoverPixel && hover && scale.x >= 2 && scale.y >= 2) {
            ctx.save();
            const cellX = hover.x * scale.x + 0.5;
            const cellY = hover.y * scale.y + 0.5;
            const cellW = Math.max(1, scale.x - 1);
            const cellH = Math.max(1, scale.y - 1);
            if (palette.hoverFill && typeof ctx.fillRect === 'function') {
                ctx.fillStyle = palette.hoverFill;
                ctx.fillRect(cellX, cellY, cellW, cellH);
            }
            ctx.strokeStyle = palette.hoverStroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(cellX, cellY, cellW, cellH);
            ctx.restore();
        }
    }
}
