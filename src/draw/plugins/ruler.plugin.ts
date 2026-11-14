import {DrawPlugin} from './draw.plugin';

export class RulerPlugin extends DrawPlugin {
    public update(ctx: CanvasRenderingContext2D): void {
        const { scale, display, grid } = this.session.state;
        const { interfaceColors } = this.session.getPlatformFeatures();
        const canvasW = display.x * scale.x;
        const canvasH = display.y * scale.y;
        const sub = grid?.subdivision;
        const majorStep = sub && sub > 0 ? sub : 10;

        ctx.save();
        ctx.translate(0.5, 0.5);
        ctx.beginPath();
        // Top ruler
        for (let i = 0; i < display.x; i += 2) {
            ctx.moveTo(i * scale.x, -8);
            ctx.lineTo(i * scale.x, i % majorStep === 0 ? -2 : -5);
        }
        // Left ruler
        for (let i = 0; i < display.y; i += 2) {
            ctx.moveTo(-8, i * scale.y);
            ctx.lineTo(i % majorStep === 0 ? -2 : -5, i * scale.y);
        }
        // Bottom ruler (mirrored)
        for (let i = 0; i < display.x; i += 2) {
            ctx.moveTo(i * scale.x, canvasH + 8);
            ctx.lineTo(i * scale.x, i % majorStep === 0 ? canvasH + 2 : canvasH + 5);
        }
        // Right ruler (mirrored)
        for (let i = 0; i < display.y; i += 2) {
            ctx.moveTo(canvasW + 8, i * scale.y);
            ctx.lineTo(i % majorStep === 0 ? canvasW + 2 : canvasW + 5, i * scale.y);
        }
        ctx.strokeStyle = interfaceColors.rulerColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        const hasSelection = this.session.layersManager?.sorted?.some((layer) => layer.selected || layer.isEditing());
        if (scale.x >= 3 && !hasSelection) {
            const labelStep = scale.x >= 6 ? majorStep : majorStep === 8 ? 16 : majorStep * 2;
            ctx.font = '8px monospace';
            ctx.fillStyle = interfaceColors.rulerColor;
            ctx.globalAlpha = 0.65;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            for (let x = 0; x < display.x; x += labelStep) {
                ctx.fillText(`${x}`, x * scale.x, -10);
            }

            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let y = 0; y < display.y; y += labelStep) {
                ctx.fillText(`${y}`, -10, y * scale.y);
            }
        }

        ctx.restore();
    }
}
