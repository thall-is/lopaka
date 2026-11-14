import {applyLayerTitle} from './source-comments';
import {Point} from '../../core/point';
import {xbmpToImgData} from '../../utils';
import {AbstractParser} from './abstract-parser';

const FONT_ALIASES: Record<string, string> = {
    tom_thumb_4x6: '4x6',
    logisoso16: 'profont17',
    '7x13B': '6x13B',
};

export class U8g2Parser extends AbstractParser {
    importSourceCode(sourceCode: string) {
        const {defines, images, methods, variables} = this.parseSourceCode(sourceCode);

        const states = [];
        let currentFont = '4x6';
        let currentColor = '#ffffff';
        let currentInverted = false;
        const warnings = [];
        methods.forEach((call) => {
            const firstState = states.length;
            if (call.functionName.includes('u8g2_')) {
                call.args.shift();
            }
            switch (call.functionName) {
                case 'u8g2_SetDrawColor':
                case 'setDrawColor':
                    {
                        const [colorMode] = this.getArgs(call.args, defines, variables);
                        if (colorMode === '0') {
                            currentColor = '#000000';
                            currentInverted = false;
                        } else if (colorMode === '2') {
                            currentColor = '#ffffff';
                            currentInverted = true;
                        } else {
                            currentColor = '#ffffff';
                            currentInverted = false;
                        }
                    }
                    break;
                case 'u8g2_SetFont':
                case 'setFont':
                    {
                        const [font] = this.getArgs(call.args, defines, variables);
                        const stripped = font
                            .replace(/^u8g2_font_/, '')
                            .replace(/^u8g_font_/, '')
                            .replace(/_(tr|tf|tn|te|mr|mf|mn|t_.*)$/, '');
                        currentFont = FONT_ALIASES[stripped] ?? stripped;
                    }
                    break;
                case 'u8g2_DrawXBMP':
                case 'u8g2_DrawXBM':
                case 'drawXBMP':
                case 'drawXBM':
                    {
                        const [x, y, width, height, name] = this.getArgs(call.args, defines, variables);
                        let imageName = this.parseImageName(name);
                        if (!images.get(imageName)) {
                            warnings.push(`Bitmap array declaration for ${name} was not found. Skipping.`);
                            break;
                        }
                        states.push({
                            type: 'paint',
                            data: xbmpToImgData(images.get(imageName), width, height),
                            position: new Point(parseInt(x), parseInt(y)),
                            size: new Point(parseInt(width), parseInt(height)),
                            imageName,
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawLine':
                case 'drawLine':
                    {
                        const [x1, y1, x2, y2] = this.getArgs(call.args, defines, variables);
                        states.push({
                            type: 'line',
                            p1: new Point(parseInt(x1), parseInt(y1)),
                            p2: new Point(parseInt(x2), parseInt(y2)),
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawHLine':
                case 'drawHLine':
                    {
                        const [x, y, w] = this.getArgs(call.args, defines, variables);
                        const px = parseInt(x);
                        const py = parseInt(y);
                        const pw = parseInt(w);
                        states.push({
                            type: 'line',
                            p1: new Point(px, py),
                            p2: new Point(px + Math.max(0, pw - 1), py),
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawVLine':
                case 'drawVLine':
                    {
                        const [x, y, h] = this.getArgs(call.args, defines, variables);
                        const px = parseInt(x);
                        const py = parseInt(y);
                        const ph = parseInt(h);
                        states.push({
                            type: 'line',
                            p1: new Point(px, py),
                            p2: new Point(px, py + Math.max(0, ph - 1)),
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawBox':
                case 'u8g2_DrawFrame':
                case 'drawBox':
                case 'drawFrame':
                    {
                        const [x, y, width, height] = this.getArgs(call.args, defines, variables);
                        states.push({
                            type: 'rect',
                            position: new Point(parseInt(x), parseInt(y)),
                            size: new Point(parseInt(width), parseInt(height)),
                            fill: call.functionName === 'drawBox' || call.functionName === 'u8g2_DrawBox',
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawRBox':
                case 'u8g2_DrawRFrame':
                case 'drawRBox':
                case 'drawRFrame':
                    {
                        const [x, y, width, height, radius] = this.getArgs(call.args, defines, variables);
                        states.push({
                            type: 'rect',
                            position: new Point(parseInt(x), parseInt(y)),
                            size: new Point(parseInt(width), parseInt(height)),
                            radius: parseInt(radius) || 0,
                            fill: call.functionName === 'drawRBox' || call.functionName === 'u8g2_DrawRBox',
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawPixel':
                case 'drawPixel':
                    {
                        const [x, y] = this.getArgs(call.args, defines, variables);
                        states.push({
                            type: 'dot',
                            position: new Point(parseInt(x), parseInt(y)),
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawStr':
                case 'u8g2_DrawUTF8':
                case 'drawStr':
                case 'drawUTF8':
                    {
                        const [x, y, text] = this.getArgs(call.args, defines, variables);
                        states.push({
                            type: 'string',
                            text: text ? text.replace(/"/g, '') : 'Text',
                            position: new Point(parseInt(x), parseInt(y)),
                            font: currentFont,
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawCircle':
                case 'u8g2_DrawDisc':
                case 'drawCircle':
                case 'drawDisc': {
                    const [x, y, radius] = this.getArgs(call.args, defines, variables);
                    states.push({
                        type: 'circle',
                        position: new Point(parseInt(x) - parseInt(radius), parseInt(y) - parseInt(radius)),
                        radius: parseInt(radius),
                        fill: call.functionName === 'drawDisc' || call.functionName === 'u8g2_DrawDisc',
                        color: currentColor,
                        inverted: currentInverted,
                    });
                    break;
                }
                case 'u8g2_DrawEllipse':
                case 'u8g2_DrawFilledEllipse':
                case 'drawEllipse':
                case 'drawFilledEllipse':
                    {
                        const [x, y, rx, ry] = this.getArgs(call.args, defines, variables);
                        states.push({
                            type: 'ellipse',
                            position: new Point(parseInt(x) - parseInt(rx), parseInt(y) - parseInt(ry)),
                            rx: parseInt(rx),
                            ry: parseInt(ry),
                            fill:
                                call.functionName === 'drawFilledEllipse' ||
                                call.functionName === 'u8g2_DrawFilledEllipse',
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
                case 'u8g2_DrawTriangle':
                case 'drawTriangle':
                    {
                        const [x1, y1, x2, y2, x3, y3] = this.getArgs(call.args, defines, variables);
                        states.push({
                            type: 'triangle',
                            p1: new Point(parseInt(x1), parseInt(y1)),
                            p2: new Point(parseInt(x2), parseInt(y2)),
                            p3: new Point(parseInt(x3), parseInt(y3)),
                            fill: false,
                            color: currentColor,
                            inverted: currentInverted,
                        });
                    }
                    break;
            }
            applyLayerTitle(states, firstState, call.title);
        });
        return {states, warnings};
    }
}
