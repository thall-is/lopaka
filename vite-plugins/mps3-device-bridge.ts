import type {Plugin} from 'vite';
import fs from 'fs';
import path from 'path';
import {spawn} from 'child_process';

export interface Mps3FirmwareScreenItem {
    id: string;
    title: string;
    category: 'SEELE 01' | 'Player' | 'Connectivity' | 'Drawers' | 'System';
    description: string;
    width: number;
    height: number;
    sourceRef: string;
    cCode: string;
}

function resolveRepoRoot(): string {
    // tools/design_lab/lopaka/vite-plugins -> repo root is 4 levels up
    return path.resolve(__dirname, '../../../..');
}

function extractCByteArrays(sourceText: string, outMap: Map<string, string>) {
    const regex =
        /(?:static\s+)?(?:const\s+)?(?:unsigned\s+)?(?:char|uint8_t)\s+(?:PROGMEM\s+)?([a-zA-Z0-9_]+)\s*\[\s*\d*\s*\]\s*(?:[\w\d_]*PROGMEM)?\s*=\s*\{([^}]+)\};/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sourceText)) !== null) {
        const name = match[1];
        const cleaned = match[2]
            .replace(/\/\/[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
            .join(', ');
        if (cleaned.length > 0) {
            outMap.set(name, cleaned);
        }
    }
}

function loadMps3Bitmaps(repoRoot: string): Map<string, string> {
    const map = new Map<string, string>();
    const files = [
        path.join(repoRoot, 'components', 'oled_display', 'bitmaps.c'),
        path.join(repoRoot, 'components', 'oled_display', 'oled_display.c'),
    ];
    for (const filePath of files) {
        try {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf8');
                extractCByteArrays(raw, map);
            }
        } catch {
            // Skip unreadable optional sources
        }
    }
    return map;
}

function buildDecl(bitmaps: Map<string, string>, names: string[]): string {
    return names
        .map((name) => {
            const bytes = bitmaps.get(name);
            if (!bytes) return '';
            return `static const uint8_t ${name}[] = { ${bytes} };`;
        })
        .filter(Boolean)
        .join('\n');
}

function buildFirmwareScreens(repoRoot: string): Mps3FirmwareScreenItem[] {
    const bitmaps = loadMps3Bitmaps(repoRoot);

    return [
        {
            id: 'seele_unsupp',
            title: 'seele_01_unsupp',
            category: 'SEELE 01',
            description: 'Tela real do firmware MPS3 (oled_display_show_unsupported_ex) — Formato não suportado com monolito SEELE 01.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:4834',
            cCode: `${buildDecl(bitmaps, ['image_seele_bits'])}
u8g2_SetDrawColor(&s_u8g2, 1);
// Monolito SEELE 01 (X=46..127, Y=0..63)
u8g2_DrawXBM(&s_u8g2, 46, 0, 82, 64, image_seele_bits);
// Titulo
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 1, 11, "FORMATO");
// Badge invertido
u8g2_DrawBox(&s_u8g2, 7, 14, 32, 13);
u8g2_SetDrawColor(&s_u8g2, 0);
u8g2_DrawUTF8(&s_u8g2, 14, 24, "ALAC");
// Mensagem inferior
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 14, 43, "Nao");
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 3, 56, "SUPORTADO!");`,
        },
        {
            id: 'seele_flac_limit',
            title: 'seele_01_flac_limit',
            category: 'SEELE 01',
            description: 'Alerta SEELE 01 para FLAC acima do limite 24-bit/192kHz.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:4834',
            cCode: `${buildDecl(bitmaps, ['image_seele_bits'])}
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawXBM(&s_u8g2, 46, 0, 82, 64, image_seele_bits);
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 6, 11, "LIMITE");
u8g2_DrawBox(&s_u8g2, 7, 14, 32, 13);
u8g2_SetDrawColor(&s_u8g2, 0);
u8g2_DrawUTF8(&s_u8g2, 11, 24, "FLAC");
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 5, 38, "EXCEDIDO!");
u8g2_DrawUTF8(&s_u8g2, 3, 48, "MAX 24-BIT");
u8g2_DrawUTF8(&s_u8g2, 9, 58, "192 KHZ");`,
        },
        {
            id: 'seele_wav_limit',
            title: 'seele_01_wav_limit',
            category: 'SEELE 01',
            description: 'Alerta SEELE 01 para WAV acima do limite 32-bit/384kHz.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:4834',
            cCode: `${buildDecl(bitmaps, ['image_seele_bits'])}
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawXBM(&s_u8g2, 46, 0, 82, 64, image_seele_bits);
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 6, 11, "LIMITE");
u8g2_DrawBox(&s_u8g2, 8, 14, 30, 13);
u8g2_SetDrawColor(&s_u8g2, 0);
u8g2_DrawUTF8(&s_u8g2, 13, 24, "WAV");
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 5, 38, "EXCEDIDO!");
u8g2_DrawUTF8(&s_u8g2, 3, 48, "MAX 32-BIT");
u8g2_DrawUTF8(&s_u8g2, 9, 58, "384 KHZ");`,
        },
        {
            id: 'now_playing_classic',
            title: 'now_playing_classic',
            category: 'Player',
            description: 'Tela principal de reprodução Classic com cards sem quina, barra com 1px de padding e bateria 5x7.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:1770',
            cCode: `${buildDecl(bitmaps, ['image_Play_bits', 's_icon_heart_solid_9x9', 's_icon_loop_all_9x9', 's_icon_shuf_all_9x9'])}
static const unsigned char s_icon_bt_conn_7x9[] U8X8_PROGMEM = {0x0c, 0x14, 0x25, 0x16, 0x4c, 0x16, 0x25, 0x14, 0x0c};
static const unsigned char s_icon_bat_98_11x9[] U8X8_PROGMEM = {0xfe, 0x03, 0x01, 0x04, 0xdd, 0x05, 0x55, 0x05, 0xdd, 0x05, 0x51, 0x05, 0xd1, 0x05, 0x01, 0x04, 0xfe, 0x03};
u8g2_SetDrawColor(&s_u8g2, 1);
// Topbar
u8g2_DrawXBM(&s_u8g2, 0, 0, 5, 9, image_Play_bits);
u8g2_DrawXBM(&s_u8g2, 7, 0, 9, 9, s_icon_loop_all_9x9);
u8g2_DrawXBM(&s_u8g2, 18, 0, 9, 9, s_icon_shuf_all_9x9);
// Artist Bracket (sem quinas inferiores)
u8g2_DrawLine(&s_u8g2, 35, 0, 35, 8);
u8g2_DrawLine(&s_u8g2, 93, 0, 93, 8);
u8g2_DrawLine(&s_u8g2, 36, 9, 92, 9);
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 41, 8, "EVA OST");
// Bluetooth conectado (7x9) + Coracao (9x9) + Bateria (11x9)
u8g2_DrawXBM(&s_u8g2, 97, 0, 7, 9, s_icon_bt_conn_7x9);
u8g2_DrawXBM(&s_u8g2, 106, 0, 9, 9, s_icon_heart_solid_9x9);
u8g2_DrawXBM(&s_u8g2, 117, 0, 11, 9, s_icon_bat_98_11x9);
// Title
u8g2_SetFont(&s_u8g2, u8g2_font_t0_22b_te);
u8g2_DrawUTF8(&s_u8g2, 8, 28, "Fly Me...");
// Progress Bar (moldura sem quinas + preenchimento completo sem padding)
u8g2_DrawHLine(&s_u8g2, 1, 33, 126);
u8g2_DrawHLine(&s_u8g2, 1, 43, 126);
u8g2_DrawVLine(&s_u8g2, 0, 34, 9);
u8g2_DrawVLine(&s_u8g2, 127, 34, 9);
u8g2_DrawBox(&s_u8g2, 1, 34, 59, 9);
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_SetDrawColor(&s_u8g2, 0);
u8g2_DrawUTF8(&s_u8g2, 4, 41, "01:42");
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawUTF8(&s_u8g2, 104, 41, "04:31");
// Album
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 24, 53, "Neon Genesis OST");
// 4 Codec Cards (sem quinas superiores)
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawVLine(&s_u8g2, 2, 58, 6);
u8g2_DrawHLine(&s_u8g2, 3, 57, 19);
u8g2_DrawVLine(&s_u8g2, 22, 58, 6);
u8g2_DrawUTF8(&s_u8g2, 5, 64, "FLAC");
u8g2_DrawVLine(&s_u8g2, 36, 58, 6);
u8g2_DrawHLine(&s_u8g2, 37, 57, 15);
u8g2_DrawVLine(&s_u8g2, 52, 58, 6);
u8g2_DrawUTF8(&s_u8g2, 39, 64, "24b");
u8g2_DrawVLine(&s_u8g2, 66, 58, 6);
u8g2_DrawHLine(&s_u8g2, 67, 57, 19);
u8g2_DrawVLine(&s_u8g2, 86, 58, 6);
u8g2_DrawUTF8(&s_u8g2, 69, 64, "192k");
u8g2_DrawVLine(&s_u8g2, 100, 58, 6);
u8g2_DrawHLine(&s_u8g2, 101, 57, 23);
u8g2_DrawVLine(&s_u8g2, 124, 58, 6);
u8g2_DrawUTF8(&s_u8g2, 103, 64, "4608k");`,
        },
        {
            id: 'now_playing_hybrid',
            title: 'now_playing_hybrid',
            category: 'Player',
            description: 'Tela Hybrid com VU Meter estéreo L/R de alta resolução e barra de progresso.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:1886',
            cCode: `${buildDecl(bitmaps, ['image_Play_bits', 's_icon_heart_outline_9x9'])}
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawXBM(&s_u8g2, 1, 1, 5, 9, image_Play_bits);
u8g2_DrawXBM(&s_u8g2, 8, 1, 9, 9, s_icon_heart_outline_9x9);
u8g2_DrawLine(&s_u8g2, 42, 10, 100, 10);
u8g2_DrawLine(&s_u8g2, 42, 10, 42, 0);
u8g2_DrawLine(&s_u8g2, 100, 10, 100, 0);
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 46, 8, "Sagisu S.");
u8g2_DrawFrame(&s_u8g2, 113, 2, 13, 7);
u8g2_DrawBox(&s_u8g2, 115, 4, 8, 3);
// Title & Progress
u8g2_SetFont(&s_u8g2, u8g2_font_t0_22b_te);
u8g2_DrawUTF8(&s_u8g2, 6, 28, "Komm Susser");
u8g2_DrawFrame(&s_u8g2, 0, 33, 128, 11);
u8g2_DrawBox(&s_u8g2, 2, 35, 82, 7);
// Album compact
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 26, 50, "THE END OF EVANGELION");
// Stereo L/R VU
u8g2_DrawUTF8(&s_u8g2, 0, 57, "L");
u8g2_DrawFrame(&s_u8g2, 9, 53, 118, 5);
u8g2_DrawBox(&s_u8g2, 11, 54, 84, 3);
u8g2_DrawBox(&s_u8g2, 102, 54, 2, 3);
u8g2_DrawUTF8(&s_u8g2, 0, 63, "R");
u8g2_DrawFrame(&s_u8g2, 9, 59, 118, 5);
u8g2_DrawBox(&s_u8g2, 11, 60, 76, 3);
u8g2_DrawBox(&s_u8g2, 94, 60, 2, 3);`,
        },
        {
            id: 'usb_dac_screen',
            title: 'usb_dac_vu',
            category: 'Player',
            description: 'Modo USB Audio Class DAC com grandes medidores VU L/R, régua dBFS e cards de taxa.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:4428',
            cCode: `${buildDecl(bitmaps, ['image_Play_bits'])}
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawXBM(&s_u8g2, 1, 1, 5, 9, image_Play_bits);
u8g2_DrawLine(&s_u8g2, 38, 11, 90, 11);
u8g2_DrawLine(&s_u8g2, 38, 10, 38, 0);
u8g2_DrawLine(&s_u8g2, 90, 11, 90, 0);
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 42, 9, "USB DAC");
u8g2_DrawFrame(&s_u8g2, 113, 2, 13, 7);
u8g2_DrawBox(&s_u8g2, 115, 4, 10, 3);
u8g2_DrawHLine(&s_u8g2, 0, 13, 128);
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 0, 20, "Vol: 82%");
u8g2_DrawUTF8(&s_u8g2, 66, 20, "STREAMING ATIVO");
// L / R Big Bars
u8g2_DrawUTF8(&s_u8g2, 0, 28, "L");
u8g2_DrawFrame(&s_u8g2, 10, 22, 117, 8);
u8g2_DrawBox(&s_u8g2, 11, 23, 88, 6);
u8g2_DrawBox(&s_u8g2, 105, 23, 2, 6);
u8g2_DrawUTF8(&s_u8g2, 0, 39, "R");
u8g2_DrawFrame(&s_u8g2, 10, 33, 117, 8);
u8g2_DrawBox(&s_u8g2, 11, 34, 82, 6);
u8g2_DrawBox(&s_u8g2, 99, 34, 2, 6);
// Scale dB
u8g2_DrawUTF8(&s_u8g2, 10, 48, "-40");
u8g2_DrawUTF8(&s_u8g2, 51, 48, "-24");
u8g2_DrawUTF8(&s_u8g2, 85, 48, "-12");
u8g2_DrawUTF8(&s_u8g2, 104, 48, "-6");
u8g2_DrawUTF8(&s_u8g2, 120, 48, "0");
u8g2_DrawHLine(&s_u8g2, 0, 50, 128);
u8g2_DrawFrame(&s_u8g2, 0, 56, 24, 8);
u8g2_DrawUTF8(&s_u8g2, 5, 63, "24b");
u8g2_DrawFrame(&s_u8g2, 32, 56, 24, 8);
u8g2_DrawUTF8(&s_u8g2, 37, 63, "48k");
u8g2_DrawFrame(&s_u8g2, 64, 56, 34, 8);
u8g2_DrawUTF8(&s_u8g2, 69, 63, "Rock");`,
        },
        {
            id: 'wifi_connected_screen',
            title: 'wifi_portal_ip',
            category: 'Connectivity',
            description: 'Central Web Wi-Fi com barra XOR de sinal RSSI no topo, bloco central unificado de status/IP e URL http://mps3.local.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:3939',
            cCode: `u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawFrame(&s_u8g2, 0, 0, 128, 12);
u8g2_SetFont(&s_u8g2, u8g2_font_haxrcorp4089_tr);
u8g2_DrawUTF8(&s_u8g2, 45, 9, "-52 dBm");
u8g2_SetDrawColor(&s_u8g2, 2);
u8g2_DrawBox(&s_u8g2, 1, 1, 79, 10);
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawRFrame(&s_u8g2, 2, 23, 124, 19, 3);
u8g2_SetFont(&s_u8g2, u8g2_font_t0_16b_te);
u8g2_DrawUTF8(&s_u8g2, 4, 38, "192.168.100.420");
u8g2_SetFont(&s_u8g2, u8g2_font_t0_14b_te);
u8g2_DrawUTF8(&s_u8g2, 5, 62, "http://mps3.local");`,
        },
        {
            id: 'wifi_transfer_screen',
            title: 'wifi_upload_rx',
            category: 'Connectivity',
            description: 'Tela de upload de músicas via Wi-Fi com barra XOR de sinal RSSI, velocidade, cápsulas de ETA e barras de progresso.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:3993',
            cCode: `u8g2_SetDrawColor(&s_u8g2, 1);
// Connection tab with XOR RSSI bar
u8g2_DrawVLine(&s_u8g2, 0, 0, 9);
u8g2_DrawVLine(&s_u8g2, 65, 0, 9);
u8g2_DrawHLine(&s_u8g2, 1, 9, 64);
u8g2_SetFont(&s_u8g2, u8g2_font_haxrcorp4089_tr);
u8g2_DrawUTF8(&s_u8g2, 3, 8, "-54 dBm");
u8g2_SetDrawColor(&s_u8g2, 2);
u8g2_DrawBox(&s_u8g2, 1, 0, 42, 9);
u8g2_SetDrawColor(&s_u8g2, 1);
// Speed tab
u8g2_DrawVLine(&s_u8g2, 71, 0, 9);
u8g2_DrawVLine(&s_u8g2, 122, 0, 9);
u8g2_DrawHLine(&s_u8g2, 72, 9, 50);
u8g2_DrawUTF8(&s_u8g2, 74, 8, "1240 KB/s");
// Filename + File ETA pill
u8g2_SetFont(&s_u8g2, u8g2_font_t0_13b_te);
u8g2_DrawUTF8(&s_u8g2, 0, 24, "03_Angel.flac");
u8g2_DrawRFrame(&s_u8g2, 110, 14, 13, 11, 1);
u8g2_SetFont(&s_u8g2, u8g2_font_haxrcorp4089_tr);
u8g2_DrawUTF8(&s_u8g2, 112, 23, "4s");
// File progress bar
u8g2_DrawFrame(&s_u8g2, 0, 27, 128, 10);
u8g2_DrawBox(&s_u8g2, 1, 28, 76, 8);
// Total row + counter & ETA pills
u8g2_DrawUTF8(&s_u8g2, 0, 47, "Total:");
u8g2_DrawRFrame(&s_u8g2, 32, 38, 24, 11, 1);
u8g2_DrawPixel(&s_u8g2, 43, 39);
u8g2_DrawPixel(&s_u8g2, 43, 41);
u8g2_DrawPixel(&s_u8g2, 43, 43);
u8g2_DrawPixel(&s_u8g2, 43, 45);
u8g2_DrawPixel(&s_u8g2, 43, 47);
u8g2_DrawUTF8(&s_u8g2, 34, 47, "3");
u8g2_DrawUTF8(&s_u8g2, 46, 47, "12");
u8g2_DrawRFrame(&s_u8g2, 106, 38, 19, 11, 1);
u8g2_DrawUTF8(&s_u8g2, 108, 47, "38s");
// Batch progress bar
u8g2_DrawFrame(&s_u8g2, 0, 51, 128, 10);
u8g2_DrawBox(&s_u8g2, 1, 52, 42, 8);`,
        },
        {
            id: 'eq_preset_drawer',
            title: 'eq_preset_list',
            category: 'Drawers',
            description: 'Menu de perfis de equalização paramétrica de 10 bandas com seleção invertida.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:4937',
            cCode: `u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawBox(&s_u8g2, 0, 0, 128, 12);
u8g2_SetDrawColor(&s_u8g2, 0);
u8g2_SetFont(&s_u8g2, u8g2_font_6x10_tf);
u8g2_DrawUTF8(&s_u8g2, 4, 9, "PERFIL EQ");
u8g2_DrawBox(&s_u8g2, 104, 1, 22, 10);
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawUTF8(&s_u8g2, 109, 9, "ON");
// Selected row 1
u8g2_DrawBox(&s_u8g2, 0, 14, 128, 12);
u8g2_SetDrawColor(&s_u8g2, 0);
u8g2_DrawUTF8(&s_u8g2, 2, 24, "*1.Harman Target");
u8g2_DrawUTF8(&s_u8g2, 118, 24, ">");
// Other rows
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawUTF8(&s_u8g2, 2, 37, " 2.Flat Reference");
u8g2_DrawUTF8(&s_u8g2, 2, 50, " 3.Bass Boost");
// Footer
u8g2_DrawLine(&s_u8g2, 0, 54, 128, 54);
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 2, 62, "> Bandas | Segure: Renomear");`,
        },
        {
            id: 'sd_error_screen',
            title: 'sd_card_error',
            category: 'System',
            description: 'Tela de falha ao montar cartão microSD com ícone oficial image_SDQuestion_copy_1_bits.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:4388',
            cCode: `${buildDecl(bitmaps, ['image_SDQuestion_copy_1_bits'])}
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawXBM(&s_u8g2, 12, 8, 35, 43, image_SDQuestion_copy_1_bits);
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 55, 29, "Erro ao montar");
u8g2_DrawUTF8(&s_u8g2, 65, 39, "o SD card !");
u8g2_SetFont(&s_u8g2, u8g2_font_6x10_tf);
u8g2_DrawUTF8(&s_u8g2, 6, 62, "verifique a fiacao !");`,
        },
        {
            id: 'lock_clock_screen',
            title: 'lock_clock',
            category: 'System',
            description: 'Tela de bloqueio / repouso com relógio DS3231 em profont29, abas de dia/data em profont15, faixa no topo e bateria.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:6144',
            cCode: `static const unsigned char s_icon_bat_98_11x9[] U8X8_PROGMEM = {0xfe, 0x03, 0x01, 0x04, 0xdd, 0x05, 0x55, 0x05, 0xdd, 0x05, 0x51, 0x05, 0xd1, 0x05, 0x01, 0x04, 0xfe, 0x03};
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawVLine(&s_u8g2, 97, 0, 8);
u8g2_DrawHLine(&s_u8g2, 0, 8, 97);
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 0, 6, "> A Cruel Angel's Thesis");
u8g2_DrawXBM(&s_u8g2, 118, 0, 11, 9, s_icon_bat_98_11x9);
u8g2_SetFont(&s_u8g2, u8g2_font_profont29_tf);
u8g2_DrawUTF8(&s_u8g2, 0, 40, "23:45:12");
u8g2_DrawHLine(&s_u8g2, 1, 53, 24);
u8g2_DrawVLine(&s_u8g2, 0, 54, 10);
u8g2_DrawVLine(&s_u8g2, 25, 54, 10);
u8g2_SetFont(&s_u8g2, u8g2_font_profont15_tf);
u8g2_DrawUTF8(&s_u8g2, 3, 64, "SAB");
u8g2_DrawHLine(&s_u8g2, 54, 52, 73);
u8g2_DrawVLine(&s_u8g2, 53, 53, 11);
u8g2_DrawVLine(&s_u8g2, 127, 53, 11);
u8g2_DrawUTF8(&s_u8g2, 56, 64, "14/11/2026");`,
        },
        {
            id: 'chrono_screen',
            title: 'cronometro',
            category: 'System',
            description: 'Cronômetro de precisão com registro de voltas (laps) em centésimos de segundo.',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:5573',
            cCode: `u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_SetFont(&s_u8g2, u8g2_font_profont11_tf);
u8g2_DrawUTF8(&s_u8g2, 3, 10, "CRONOMETRO");
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 86, 9, "[RODANDO]");
u8g2_DrawHLine(&s_u8g2, 0, 12, 128);
u8g2_SetFont(&s_u8g2, u8g2_font_logisoso16_tn);
u8g2_DrawUTF8(&s_u8g2, 20, 33, "01:24.58");
u8g2_DrawHLine(&s_u8g2, 4, 37, 120);
u8g2_SetFont(&s_u8g2, u8g2_font_5x7_tf);
u8g2_DrawUTF8(&s_u8g2, 6, 47, "V2: 00:42.15");
u8g2_DrawUTF8(&s_u8g2, 70, 47, "V1: 00:21.04");
u8g2_DrawHLine(&s_u8g2, 0, 51, 128);
u8g2_SetFont(&s_u8g2, u8g2_font_4x6_tf);
u8g2_DrawUTF8(&s_u8g2, 4, 61, "[C] Pausar  [DIR] Volta  [ESQ] Sair");`,
        },
        {
            id: 'loading_screen',
            title: 'loading_hourglass',
            category: 'System',
            description: 'Tela de carregamento com ampulheta oficial 24x24 (image_LoadingHourglass_bits).',
            width: 128,
            height: 64,
            sourceRef: 'oled_display.c:4377',
            cCode: `${buildDecl(bitmaps, ['image_LoadingHourglass_bits'])}
u8g2_SetDrawColor(&s_u8g2, 1);
u8g2_DrawXBM(&s_u8g2, 52, 20, 24, 24, image_LoadingHourglass_bits);
u8g2_SetFont(&s_u8g2, u8g2_font_helvB08_te);
u8g2_DrawUTF8(&s_u8g2, 31, 56, "Carregando...");`,
        },
    ];
}

function captureFromDevice(repoRoot: string, port: string): Promise<any> {
    return new Promise((resolve) => {
        if (!/^(COM\d{1,3}|\/dev\/tty[A-Za-z0-9_.-]+)$/i.test(port)) {
            resolve({ok: false, error: `Porta serial inválida: ${port}`});
            return;
        }

        const pyScript = `
import sys, json, base64, os
repo_root = os.getcwd()
sys.path.insert(0, os.path.join(repo_root, 'tools'))
try:
    import oled_screenshot
    raw = oled_screenshot.capture_framebuffer(port=sys.argv[1], baudrate=115200, timeout=1.6)
    if not raw or len(raw) != 1024:
        print(json.dumps({'ok': False, 'error': f'Sem resposta (@SCR) em {sys.argv[1]}. Conecte o MPS3 via USB e tente novamente.'}))
        sys.exit(0)
    pixels = oled_screenshot.decode_ssd1306(raw, rotate_180=True)
    xbm = []
    for y in range(64):
        for bx in range(16):
            b = 0
            for bit in range(8):
                if pixels[y][bx * 8 + bit]:
                    b |= (1 << bit)
            xbm.append(f'0x{b:02x}')
    png_bytes = oled_screenshot.make_png(pixels, scale=4, color_on=(255, 255, 255), color_off=(35, 38, 52))
    print(json.dumps({
        'ok': True,
        'port': sys.argv[1],
        'width': 128,
        'height': 64,
        'pngDataUrl': 'data:image/png;base64,' + base64.b64encode(png_bytes).decode('ascii'),
        'xbmData': ', '.join(xbm),
    }))
except Exception as exc:
    print(json.dumps({'ok': False, 'error': str(exc)}))
`;

        const child = spawn('python', ['-c', pyScript, port], {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            try {
                child.kill();
            } catch {
                // ignore
            }
            resolve({ok: false, error: `Timeout ao capturar tela em ${port}.`});
        }, 5000);

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('close', () => {
            clearTimeout(timer);
            try {
                const lines = stdout.trim().split(/\r?\n/);
                const lastLine = lines[lines.length - 1] || '';
                const parsed = JSON.parse(lastLine);
                resolve(parsed);
            } catch {
                resolve({
                    ok: false,
                    error: stderr.trim() || stdout.trim() || `Falha ao executar captura na porta ${port}.`,
                });
            }
        });
    });
}

export default function mps3DeviceBridgePlugin(): Plugin {
    return {
        name: 'mps3-device-bridge',
        configureServer(server) {
            const repoRoot = resolveRepoRoot();

            server.middlewares.use('/api/mps3/firmware-screens', (_req, res) => {
                try {
                    const screens = buildFirmwareScreens(repoRoot);
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(
                        JSON.stringify({
                            ok: true,
                            sourceFile: 'components/oled_display/oled_display.c',
                            screens,
                        })
                    );
                } catch (err: any) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ok: false, error: err?.message || String(err)}));
                }
            });

            server.middlewares.use('/api/mps3/capture', async (req, res) => {
                try {
                    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
                    const port = (reqUrl.searchParams.get('port') || 'COM5').trim();
                    const result = await captureFromDevice(repoRoot, port);
                    if (result.ok && result.xbmData) {
                        const cCode = `static const uint8_t image_mps3_capture_bits[] = { ${result.xbmData} };\nu8g2_SetDrawColor(&s_u8g2, 1);\nu8g2_DrawXBM(&s_u8g2, 0, 0, 128, 64, image_mps3_capture_bits);`;
                        result.cCode = cCode;
                    }
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify(result));
                } catch (err: any) {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ok: false, error: err?.message || String(err)}));
                }
            });
        },
    };
}
