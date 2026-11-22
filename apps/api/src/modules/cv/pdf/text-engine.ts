import type PDFDocument from 'pdfkit';

export type RGB = [number, number, number];

export interface TextStyle {
  size: number;
  font?: 'regular' | 'bold' | 'serif' | 'serifBold' | 'mono';
  color?: RGB;
  lineGap?: number;
  charSpace?: number;
  align?: 'left' | 'right' | 'center';
}

const FONT_MAP: Record<NonNullable<TextStyle['font']>, string> = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  serif: 'Times-Roman',
  serifBold: 'Times-Bold',
  mono: 'Courier',
};

export function hexToRgb(color: string | undefined, fallback = '#035c80'): RGB {
  const value = (color ?? fallback).replace('#', '').trim();
  const full =
    value.length === 3 ? value.split('').map((c) => c + c).join('') : value.padEnd(6, '0').slice(0, 6);
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return hexToRgb(fallback);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

/**
 * PDFKit normalises colour *arrays* as 0–255 integers (dividing by 255), so
 * passing 0–1 floats silently produces near-black. All painting therefore goes
 * through hex strings, which PDFKit treats as exact sRGB values.
 */
export function css(color: RGB): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

export function lighten(color: RGB, amount: number): RGB {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
  ];
}

/**
 * Deterministic text layout on top of PDFKit.
 *
 * PDFKit's built-in `text()` auto-paginates and mutates its internal cursor,
 * which makes precise multi-column layouts fragile. We therefore wrap text
 * ourselves and draw one line at a time at an explicit baseline, so the
 * renderer fully controls pagination.
 */
export class TextEngine {
  constructor(private readonly doc: PDFKit.PDFDocument) {}

  private apply(style: TextStyle): void {
    this.doc.font(FONT_MAP[style.font ?? 'regular']);
    this.doc.fontSize(style.size);
    this.doc.fillColor(css(style.color ?? [0.11, 0.16, 0.2]));
  }

  /** Total line height (font size × leading + optional gap). */
  lineHeight(style: TextStyle): number {
    return style.size * 1.28 + (style.lineGap ?? 0);
  }

  measure(text: string, style: TextStyle, maxWidth: number): number {
    this.apply(style);
    const width = this.doc.widthOfString(text, { characterSpacing: style.charSpace ?? 0 });
    if (width <= maxWidth || maxWidth <= 0) return width;
    return maxWidth;
  }

  /**
   * Word-wrap that respects long unbreakable tokens (URLs, hashes) by
   * hard-splitting them instead of overflowing the column.
   */
  wrap(text: string, style: TextStyle, maxWidth: number): string[] {
    if (!text) return [];
    this.apply(style);
    const charSpace = style.charSpace ?? 0;
    const widthOf = (s: string) => this.doc.widthOfString(s, { characterSpacing: charSpace });

    const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
    const lines: string[] = [];

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) {
        lines.push('');
        continue;
      }
      const words = trimmed.split(/\s+/);
      let current = '';

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (widthOf(candidate) <= maxWidth) {
          current = candidate;
          continue;
        }
        if (current) {
          lines.push(current);
          current = '';
        }
        // Token longer than the column: split by characters.
        if (widthOf(word) > maxWidth) {
          let chunk = '';
          for (const char of word) {
            if (widthOf(chunk + char) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = char;
            } else {
              chunk += char;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  /** Draws pre-wrapped lines starting at `y` (top of the first line). */
  drawLines(lines: string[], x: number, y: number, maxWidth: number, style: TextStyle): number {
    this.apply(style);
    const lh = this.lineHeight(style);
    lines.forEach((line, index) => {
      if (!line) return;
      let drawX = x;
      if (style.align === 'right') {
        drawX = x + maxWidth - this.measure(line, style, maxWidth);
      } else if (style.align === 'center') {
        drawX = x + (maxWidth - this.measure(line, style, maxWidth)) / 2;
      }
      this.doc.text(line, drawX, y + index * lh, {
        lineBreak: false,
        characterSpacing: style.charSpace ?? 0,
      });
    });
    return lines.length * lh;
  }

  /** Convenience: wrap + draw, returns consumed height. */
  draw(text: string, x: number, y: number, maxWidth: number, style: TextStyle): number {
    return this.drawLines(this.wrap(text, style, maxWidth), x, y, maxWidth, style);
  }

  /** Wrapped height without drawing — used for pagination decisions. */
  heightOf(text: string, style: TextStyle, maxWidth: number): number {
    return this.wrap(text, style, maxWidth).length * this.lineHeight(style);
  }
}

export type { PDFDocument };
