import { describe, expect, it, vi } from 'vitest';
import { Point } from '../../core/point';
import { DEFAULT_GRID_SETTINGS, TGridSettings } from '../../core/session';
import { GridPlugin } from './grid.plugin';

const createContext = () => {
    return {
        save: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        setLineDash: vi.fn(),
        stroke: vi.fn(),
        strokeRect: vi.fn(),
        fillRect: vi.fn(),
        restore: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
};

const createSession = (gridOverrides: Partial<TGridSettings> = {}) => ({
    state: {
        display: new Point(128, 64),
        scale: new Point(4, 4),
        grid: {
            ...DEFAULT_GRID_SETTINGS,
            ...gridOverrides,
        },
        hoverPixel: null as { x: number; y: number } | null,
    },
});

describe('GridPlugin', () => {
    it('does not draw grid lines when grid.enabled is false', () => {
        const session = createSession({ enabled: false, showHoverPixel: false });
        const plugin = new GridPlugin(session as any);
        const ctx = createContext();

        plugin.update(ctx, null as unknown as Point, null as unknown as MouseEvent);

        expect(ctx.moveTo).not.toHaveBeenCalled();
        expect(ctx.lineTo).not.toHaveBeenCalled();
        expect(ctx.stroke).not.toHaveBeenCalled();
        expect(ctx.strokeRect).not.toHaveBeenCalled();
    });

    it('draws minor 1px lines, 8px subdivision lines, and center lines on 128x64 at 4x scale', () => {
        const session = createSession({
            enabled: true,
            subdivision: 8,
            showCenter: true,
            showHoverPixel: false,
        });
        const plugin = new GridPlugin(session as any);
        const ctx = createContext();

        plugin.update(ctx, null as unknown as Point, null as unknown as MouseEvent);

        // 3 stroke passes: minor grid, 8px major subdivisions, and center crosshair
        expect(ctx.stroke).toHaveBeenCalledTimes(3);
        expect(ctx.setLineDash).toHaveBeenCalledWith([2, 2]);
        // Center crosshair at (64, 32) * 4 + 0.5 -> (256.5, 128.5)
        expect(ctx.moveTo).toHaveBeenCalledWith(256.5, 0);
        expect(ctx.lineTo).toHaveBeenCalledWith(256.5, 256);
        expect(ctx.moveTo).toHaveBeenCalledWith(0, 128.5);
        expect(ctx.lineTo).toHaveBeenCalledWith(512, 128.5);
        // Major subdivision at x = 8 -> 32.5, y = 8 -> 32.5
        expect(ctx.moveTo).toHaveBeenCalledWith(32.5, 0);
        expect(ctx.moveTo).toHaveBeenCalledWith(0, 32.5);
        // Minor grid at x = 1 -> 4.5, y = 1 -> 4.5
        expect(ctx.moveTo).toHaveBeenCalledWith(4.5, 0);
        expect(ctx.moveTo).toHaveBeenCalledWith(0, 4.5);
    });

    it('tracks hoverPixel on mousemove and resets it on mouseleave', () => {
        const session = createSession({ enabled: false, showHoverPixel: true, colorMode: 'studio' });
        const plugin = new GridPlugin(session as any);
        const ctx = createContext();

        plugin.update(ctx, new Point(42, 22), { type: 'mousemove' } as MouseEvent);
        expect(session.state.hoverPixel).toEqual({ x: 10, y: 5 });
        expect(ctx.strokeRect).toHaveBeenCalledWith(40.5, 20.5, 3, 3);
        expect(ctx.strokeStyle).toBe('#00d8ff');
        expect(ctx.fillRect).toHaveBeenCalledWith(40.5, 20.5, 3, 3);

        plugin.update(ctx, new Point(42, 22), { type: 'mouseleave' } as MouseEvent);
        expect(session.state.hoverPixel).toBeNull();
    });
});
