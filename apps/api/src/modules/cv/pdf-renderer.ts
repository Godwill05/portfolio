import PDFDocument from 'pdfkit';
import { CvSectionType } from '../../common/constants/domain';
import type { CvDocument, CvSection, CvSectionItem } from '../../database/entities/cv.entity';
import { resolveTemplate, type TemplateDefinition } from './template-registry';
import { TextEngine, css, hexToRgb, lighten, type RGB, type TextStyle } from './pdf/text-engine';

export interface RenderOptions {
  document: CvDocument;
  templateKey: string;
  style?: {
    accentColor?: string;
    fontFamily?: string;
    fontScale?: number;
    headingCase?: 'none' | 'upper';
    showPhoto?: boolean;
    density?: 'compact' | 'normal' | 'relaxed';
  } | null;
}

const A4 = { width: 595.28, height: 841.89 };
const PAGE_BOTTOM = A4.height - 48;

/**
 * Server-side PDF renderer for all 12 CV templates.
 *
 * Design goals:
 *  - Deterministic layout: we own wrapping and pagination (see TextEngine).
 *  - Real, selectable text (ATS-parseable), never an image.
 *  - Each layout is a genuinely different composition, not a recolour.
 */
class CvPdfRenderer {
  private doc!: PDFKit.PDFDocument;
  private text!: TextEngine;
  private readonly template: TemplateDefinition;
  private readonly accent: RGB;
  private readonly ink: RGB = [0.11, 0.16, 0.2];
  private readonly muted: RGB = [0.45, 0.5, 0.55];
  private readonly scale: number;
  private readonly upper: boolean;

  /** Vertical cursor, and the geometry of the current content column. */
  private cursorY = 0;
  private colX = 48;
  private colW = 499;

  constructor(private readonly options: RenderOptions) {
    this.template = resolveTemplate(options.templateKey);
    this.accent = hexToRgb(options.style?.accentColor ?? this.template.defaults.accentColor);
    this.scale = (options.style?.fontScale ?? this.template.defaults.fontScale) || 1;
    this.upper =
      options.style?.headingCase === 'upper' || this.template.defaults.headingCase === 'upper';
  }

  private get serif(): boolean {
    return this.template.layout.includes('serif') || this.template.fontStack.heading.includes('Fraunces');
  }

  private get mono(): boolean {
    return this.template.layout === 'tech-sidebar';
  }

  private get rule(): 'line' | 'none' | 'dotted' {
    return this.template.defaults.dividerStyle;
  }

  private size(base: number): number {
    return base * this.scale;
  }

  // Height model helpers
  private bodyStyle(extra: Partial<TextStyle> = {}): TextStyle {
    return { size: this.size(9.5), color: lighten(this.ink, 0), lineGap: 2.2, ...extra };
  }

  async render(): Promise<Buffer> {
    this.doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      info: {
        Title: `${this.options.document.header.fullName} — CV`,
        Author: this.options.document.header.fullName,
        Creator: 'FolioForge',
        Subject: this.options.document.header.headline ?? 'Curriculum Vitae',
        Keywords: 'CV, curriculum vitae, FolioForge',
      },
      compress: true,
    });
    this.text = new TextEngine(this.doc);

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      this.doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
    });

    this.compose();
    this.paintFooters();
    this.doc.end();
    return done;
  }

  private compose(): void {
    switch (this.template.layout) {
      case 'modern-header':
        return this.layoutModernHeader();
      case 'minimal':
        return this.layoutMinimal();
      case 'corporate-numbered':
        return this.layoutCorporate();
      case 'tech-sidebar':
        return this.layoutSidebar('tech');
      case 'creative-band':
        return this.layoutSidebar('creative');
      case 'academic-serif':
        return this.layoutAcademic();
      case 'timeline':
        return this.layoutTimeline();
      case 'skills-grid':
        return this.layoutSkillsGrid();
      case 'junior':
        return this.layoutJunior();
      case 'executive':
        return this.layoutExecutive();
      case 'international':
        return this.layoutInternational();
      default:
        return this.layoutClassic();
    }
  }

  // ─────────────────────────── pagination ──────────────────────────

  private newPage(sidebar?: { width: number; fill: RGB }): void {
    this.doc.addPage();
    if (sidebar) this.doc.rect(0, 0, sidebar.width, A4.height).fill(sidebar.fill);
    this.cursorY = 52;
  }

  /** Ensures `needed` points remain before the footer; starts a new page if not. */
  private ensure(needed: number, sidebar?: { width: number; fill: RGB }): void {
    if (this.cursorY + needed <= PAGE_BOTTOM) return;
    this.newPage(sidebar);
  }

  private paintFooters(): void {
    const range = this.doc.bufferedPageRange();
    if (range.count <= 1) return;
    const isSidebar = this.template.layout === 'tech-sidebar' || this.template.layout === 'creative-band';
    const footerX = isSidebar ? (this.template.layout === 'tech-sidebar' ? 206 : 224) : 48;
    const footerW = A4.width - footerX - 48;
    for (let i = 0; i < range.count; i += 1) {
      this.doc.switchToPage(i);
      const y = A4.height - 30;
      this.text.draw(this.options.document.header.fullName, footerX, y, footerW / 2, {
        size: 7.4,
        color: hexToRgb('#8a99a3'),
      });
      this.text.draw(`${i + 1} / ${range.count}`, footerX, y, footerW, {
        size: 7.4,
        color: hexToRgb('#8a99a3'),
        align: 'right',
      });
    }
  }

  // ──────────────────────────── primitives ─────────────────────────

  /**
   * A heading must never be the last thing on a page: we reserve room for the
   * heading plus a couple of content lines before drawing it.
   */
  private ensureHeadingRoom(sidebar?: { width: number; fill: RGB }): void {
    this.ensure(this.size(10.4) * 1.3 + 26 + 44, sidebar);
  }

  private heading(section: CvSection, opts: { numbered?: string; accent?: RGB; color?: RGB; size?: number } = {}): void {
    const color = opts.color ?? opts.accent ?? this.accent;
    const size = this.size(opts.size ?? 10.4);
    const label = this.upper ? section.title.toUpperCase() : section.title;
    const offset = opts.numbered ? 22 : 0;

    if (opts.numbered) {
      this.text.draw(opts.numbered, this.colX, this.cursorY + 1, 20, {
        size: size - 1,
        font: 'bold',
        color: this.accent,
      });
    }
    const height = this.text.draw(label, this.colX + offset, this.cursorY, this.colW - offset, {
      size,
      font: this.serif ? 'serifBold' : 'bold',
      color,
      charSpace: this.upper ? 1 : 0,
    });
    this.cursorY += height + 3;

    if (this.rule !== 'none') {
      const stroke = lighten(this.accent, 0.55);
      this.doc.strokeColor(css(stroke)).lineWidth(0.7);
      if (this.rule === 'dotted') this.doc.dash(1, { space: 2.5 });
      this.doc
        .moveTo(this.colX, this.cursorY)
        .lineTo(this.colX + this.colW, this.cursorY)
        .stroke();
      if (this.rule === 'dotted') this.doc.undash();
      this.cursorY += 6;
    }
    this.cursorY += 4;
  }

  /** Renders one entry (job, degree, project). */
  private entry(item: CvSectionItem, opts: { timeline?: boolean; indent?: number } = {}): void {
    const indent = opts.indent ?? 0;
    const x = this.colX + indent + (opts.timeline ? 14 : 0);
    const width = this.colW - indent - (opts.timeline ? 14 : 0);
    const titleSize = this.size(9.8);

    const dateText = item.startDate ?? '';
    const dateWidth = dateText ? 108 : 0;
    const titleWidth = width - dateWidth;

    const titleLines = this.text.wrap(item.title ?? '', { size: titleSize, font: 'bold' }, titleWidth);
    const titleHeight = titleLines.length * this.text.lineHeight({ size: titleSize });
    const dateHeight = dateText
      ? this.text.wrap(dateText, { size: titleSize - 1 }, dateWidth).length *
        this.text.lineHeight({ size: titleSize - 1 })
      : 0;

    const subtitleSize = this.size(9.2);
    const subtitleText = item.subtitle
      ? item.meta
        ? `${item.subtitle} · ${item.meta}`
        : item.subtitle
      : '';
    const subtitleLines = subtitleText
      ? this.text.wrap(subtitleText, { size: subtitleSize }, width)
      : [];

    const descriptionLines = item.description
      ? this.text.wrap(item.description, this.bodyStyle({ size: this.size(9) }), width)
      : [];
    const bulletLines = (item.bullets ?? []).map((bullet) => ({
      lines: this.text.wrap(bullet, this.bodyStyle({ size: this.size(9) }), width - 10),
      style: this.bodyStyle({ size: this.size(9) }),
    }));

    const blockHeight =
      titleHeight +
      (subtitleLines.length ? subtitleLines.length * this.text.lineHeight({ size: subtitleSize }) + 2 : 0) +
      (descriptionLines.length ? descriptionLines.length * this.text.lineHeight(this.bodyStyle({ size: this.size(9) })) + 3 : 0) +
      bulletLines.reduce(
        (sum, bullet) => sum + bullet.lines.length * this.text.lineHeight(bullet.style) + 2,
        0,
      ) +
      (item.tags?.length ? 13 : 0) +
      10;

    this.ensure(Math.min(blockHeight, 150) + 8);

    const top = this.cursorY;
    if (opts.timeline) {
      this.doc.circle(this.colX + 4, top + 4.5, 2.5).fill(css(this.accent));
      this.doc
        .strokeColor(css(lighten(this.accent, 0.65)))
        .lineWidth(0.8)
        .moveTo(this.colX + 4, top + 8)
        .lineTo(this.colX + 4, Math.max(top + 8, top + blockHeight - 10))
        .stroke();
    }

    this.text.drawLines(titleLines, x, this.cursorY, titleWidth, { size: titleSize, font: 'bold', color: this.ink });
    if (dateText) {
      this.text.draw(dateText, x, this.cursorY + 1, width, {
        size: titleSize - 1,
        color: this.muted,
        align: 'right',
      });
    }
    this.cursorY += Math.max(titleHeight, dateHeight);

    if (subtitleLines.length) {
      this.cursorY +=
        this.text.drawLines(subtitleLines, x, this.cursorY, width, {
          size: subtitleSize,
          color: this.accent,
        }) + 2;
    }

    if (descriptionLines.length) {
      this.cursorY +=
        this.text.drawLines(descriptionLines, x, this.cursorY + 1, width, this.bodyStyle({ size: this.size(9) })) + 2;
    }

    for (const bullet of bulletLines) {
      this.doc.circle(x + 2.5, this.cursorY + this.text.lineHeight(bullet.style) / 2 - 1, 1.4).fill(css(lighten(this.accent, 0.15)));
      this.cursorY += this.text.drawLines(bullet.lines, x + 10, this.cursorY, width - 10, bullet.style) + 2;
    }

    if (item.tags?.length) {
      this.text.draw(item.tags.join('  ·  '), x, this.cursorY + 1, width, {
        size: this.size(8.2),
        color: this.muted,
        font: this.mono ? 'mono' : 'regular',
      });
      this.cursorY += 13;
    }
    this.cursorY += 9;
  }

  /** Horizontal skill bars (single column templates). */
  private skillBars(section: CvSection): void {
    for (const skill of section.items) {
      this.ensure(16);
      const labelWidth = Math.max(140, this.colW * 0.62);
      this.text.draw(skill.title ?? '', this.colX, this.cursorY, labelWidth, {
        size: this.size(9.3),
        color: this.ink,
      });
      const rating = Math.min(5, Math.max(1, skill.level ?? 3));
      const barX = this.colX + labelWidth + 12;
      const barW = this.colW - labelWidth - 12;
      const barY = this.cursorY + this.size(9.3) * 0.45;
      this.doc.roundedRect(barX, barY, barW, 3.2, 1.6).fill(css(lighten(this.accent, 0.86)));
      this.doc.roundedRect(barX, barY, (barW * rating) / 5, 3.2, 1.6).fill(css(this.accent));
      this.cursorY += 14;
    }
    this.cursorY += 4;
  }

  /** Pill-style skill list (sidebar / grid templates). */
  private skillPills(section: CvSection, opts: { x?: number; width?: number; filled?: boolean } = {}): void {
    const x = opts.x ?? this.colX;
    const width = opts.width ?? this.colW;
    let cx = x;
    const startY = this.cursorY;
    let cy = startY;
    const pillHeight = 15;
    const style: TextStyle = { size: this.size(8.4) };

    for (const skill of section.items) {
      const label = skill.title ?? '';
      const pillWidth = this.text.measure(label, style, width) + 16;
      if (cx + pillWidth > x + width) {
        cx = x;
        cy += pillHeight + 4;
      }
      if (opts.filled) {
        this.doc.roundedRect(cx, cy, pillWidth, pillHeight, 7.5).fill(css(lighten(this.accent, 0.84)));
      } else {
        this.doc
          .roundedRect(cx, cy, pillWidth, pillHeight, 7.5)
          .lineWidth(0.6)
          .strokeColor(css(lighten(this.accent, 0.55)))
          .stroke();
      }
      this.text.draw(label, cx + 8, cy + 4.2, pillWidth - 8, { ...style, color: lighten(this.accent, 0.1) });
      cx += pillWidth + 5;
    }
    this.cursorY = cy + pillHeight + 6;
  }

  private languageRows(section: CvSection, opts: { x?: number; width?: number; color?: RGB } = {}): void {
    const x = opts.x ?? this.colX;
    const width = opts.width ?? this.colW;
    for (const lang of section.items) {
      this.ensure(14);
      const label = lang.subtitle ? `${lang.title} — ${lang.subtitle}` : (lang.title ?? '');
      this.text.draw(label, x, this.cursorY, width, {
        size: this.size(9.2),
        color: opts.color ?? this.ink,
      });
      this.cursorY += 14;
    }
    this.cursorY += 2;
  }

  private contactRow(header: CvDocument['header'], opts: { x?: number; width?: number; color?: RGB; align?: 'left' | 'right' | 'center'; size?: number } = {}): void {
    const parts = [header.email, header.phone, header.location, header.website].filter(Boolean) as string[];
    if (!parts.length) return;
    this.cursorY += this.text.draw(parts.join('   ·   '), opts.x ?? this.colX, this.cursorY, opts.width ?? this.colW, {
      size: this.size(opts.size ?? 8.5),
      color: opts.color ?? this.muted,
      align: opts.align ?? 'left',
    }) + 2;
  }

  private linksRow(header: CvDocument['header'], opts: { x?: number; width?: number; color?: RGB; align?: 'left' | 'right' | 'center' } = {}): void {
    const parts = [header.linkedin, header.github, ...(header.extraLinks?.map((l) => l.url) ?? [])]
      .filter(Boolean)
      .map((url) => String(url).replace(/^https?:\/\//, '').replace(/\/$/, ''));
    if (!parts.length) return;
    this.cursorY += this.text.draw(parts.join('   ·   '), opts.x ?? this.colX, this.cursorY, opts.width ?? this.colW, {
      size: this.size(8.2),
      color: lighten(this.accent, 0.1),
      align: opts.align ?? 'left',
    });
  }

  /** Renders remaining sections generically (most templates). */
  private sectionsInOrder(
    sections: CvSection[],
    opts: {
      skip?: CvSectionType[];
      numbered?: boolean;
      timeline?: boolean;
      headingColor?: RGB;
      headingSize?: number;
    } = {},
  ): void {
    let counter = 0;
    for (const section of sections) {
      if (!section.visible) continue;
      if (opts.skip?.includes(section.type)) continue;
      if (section.type === CvSectionType.SUMMARY) {
        if (!section.body) continue;
        this.ensureHeadingRoom();
        this.heading(section, {
          color: opts.headingColor,
          size: opts.headingSize,
          numbered: opts.numbered ? String(++counter).padStart(2, '0') : undefined,
        });
        this.cursorY +=
          this.text.draw(section.body, this.colX, this.cursorY, this.colW, this.bodyStyle()) + 10;
        continue;
      }
      if (!section.items.length) continue;

      if (section.type === CvSectionType.SKILLS) {
        this.ensureHeadingRoom();
        this.heading(section, { color: opts.headingColor, size: opts.headingSize });
        if (this.template.layout === 'skills-grid') this.skillPills(section, { filled: true });
        else this.skillBars(section);
        continue;
      }
      if (section.type === CvSectionType.LANGUAGES) {
        this.ensureHeadingRoom();
        this.heading(section, { color: opts.headingColor, size: opts.headingSize });
        this.languageRows(section);
        continue;
      }

      this.ensureHeadingRoom();
      this.heading(section, {
        color: opts.headingColor,
        size: opts.headingSize,
        numbered: opts.numbered ? String(++counter).padStart(2, '0') : undefined,
      });
      for (const item of section.items) {
        this.entry(item, { timeline: opts.timeline });
      }
      this.cursorY += 2;
    }
  }

  // ───────────────────────────── layouts ───────────────────────────

  private layoutClassic(): void {
    const header = this.options.document.header;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX;

    this.cursorY += this.text.draw(header.fullName, this.colX, this.cursorY, this.colW, {
      size: this.size(21),
      font: 'bold',
    }) + 1;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, this.colX, this.cursorY + 2, this.colW, {
        size: this.size(11),
        color: this.accent,
      }) + 3;
    }
    this.cursorY += 4;
    this.contactRow(header);
    this.linksRow(header);
    this.cursorY += 6;
    this.doc.strokeColor(css(this.accent)).lineWidth(1.1).moveTo(this.colX, this.cursorY).lineTo(this.colX + this.colW, this.cursorY).stroke();
    this.cursorY += 14;

    this.sectionsInOrder(this.options.document.sections);
  }

  private layoutModernHeader(): void {
    const header = this.options.document.header;
    const bandHeight = 118;
    this.doc.rect(0, 0, A4.width, bandHeight).fill(css(this.accent));
    this.doc.rect(0, bandHeight, A4.width, 4).fill(css(lighten(this.accent, 0.45)));

    this.colX = 46;
    this.colW = A4.width - 92;
    let y = 32;
    y += this.text.draw(header.fullName, this.colX, y, this.colW, {
      size: this.size(23),
      font: 'bold',
      color: [1, 1, 1],
    }) + 2;
    if (header.headline) {
      y += this.text.draw(header.headline, this.colX, y + 2, this.colW, {
        size: this.size(10.8),
        color: lighten(this.accent, 0.85),
      }) + 4;
    }
    const contact = [header.email, header.phone, header.location, header.website].filter(Boolean).join('   ·   ');
    if (contact) {
      this.text.draw(contact, this.colX, bandHeight - 32, this.colW, {
        size: this.size(8.4),
        color: lighten(this.accent, 0.88),
      });
    }

    this.cursorY = bandHeight + 26;
    this.sectionsInOrder(this.options.document.sections);
  }

  private layoutMinimal(): void {
    const header = this.options.document.header;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX + 4;

    this.cursorY += this.text.draw(header.fullName, this.colX, this.cursorY, this.colW, {
      size: this.size(18.5),
      font: 'bold',
    }) + 2;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, this.colX, this.cursorY + 2, this.colW, {
        size: this.size(10.2),
        color: this.muted,
      }) + 6;
    }
    this.contactRow(header, { size: 8.4 });
    this.linksRow(header);
    this.cursorY += 14;
    this.sectionsInOrder(this.options.document.sections, { headingSize: 9.6 });
  }

  private layoutCorporate(): void {
    const header = this.options.document.header;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX;

    this.doc.rect(this.colX, this.cursorY, 3, 64).fill(css(this.accent));
    const textX = this.colX + 16;
    const textW = this.colW - 16;
    this.cursorY += this.text.draw(header.fullName, textX, this.cursorY, textW, {
      size: this.size(19.5),
      font: 'serifBold',
    }) + 1;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, textX, this.cursorY + 2, textW, {
        size: this.size(10.2),
        font: 'serif',
        color: this.accent,
      }) + 3;
    }
    this.contactRow(header, { x: textX, width: textW, size: 8.4 });
    this.linksRow(header, { x: textX, width: textW });
    this.cursorY += 18;
    this.sectionsInOrder(this.options.document.sections, { numbered: true, headingSize: 10 });
  }

  private layoutAcademic(): void {
    const header = this.options.document.header;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX;

    this.cursorY += this.text.draw(header.fullName, this.colX, this.cursorY, this.colW, {
      size: this.size(19.5),
      font: 'serifBold',
      align: 'center',
    }) + 2;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, this.colX, this.cursorY + 2, this.colW, {
        size: this.size(10.2),
        font: 'serif',
        color: this.muted,
        align: 'center',
      }) + 3;
    }
    this.contactRow(header, { size: 8.4, align: 'center' });
    this.linksRow(header, { align: 'center' });
    this.cursorY += 6;
    this.doc.strokeColor(css(lighten(this.accent, 0.5))).lineWidth(0.7).moveTo(this.colX, this.cursorY).lineTo(this.colX + this.colW, this.cursorY).stroke();
    this.cursorY += 14;
    this.sectionsInOrder(this.options.document.sections, { headingSize: 10.6 });
  }

  private layoutSidebar(variant: 'tech' | 'creative'): void {
    const header = this.options.document.header;
    const sections = this.options.document.sections;
    const sidebarWidth = variant === 'tech' ? 176 : 194;
    const pad = 30;
    const mainX = sidebarWidth + pad;
    const mainW = A4.width - mainX - pad;

    const sidebarFill = variant === 'tech' ? lighten(this.accent, 0.9) : this.accent;
    const sidebarInk: RGB = variant === 'tech' ? this.ink : [1, 1, 1];
    const sidebarMuted: RGB = variant === 'tech' ? this.muted : lighten(this.accent, 0.82);

    this.doc.rect(0, 0, sidebarWidth, A4.height).fill(css(sidebarFill));

    // ── Sidebar content ──
    let sy = 44;
    const sideX = 22;
    const sideW = sidebarWidth - 44;

    if (variant === 'creative' && this.options.style?.showPhoto !== false) {
      this.doc.circle(sideX + sideW / 2, sy + 28, 30).fill(css(lighten(this.accent, 0.28)));
      this.text.draw((header.fullName || '?').charAt(0).toUpperCase(), sideX, sy + 14, sideW, {
        size: this.size(22),
        font: 'serifBold',
        color: [1, 1, 1],
        align: 'center',
      });
      sy += 76;
    }

    const savedY = this.cursorY;
    this.cursorY = sy;
    this.cursorY += this.text.draw(header.fullName, sideX, this.cursorY, sideW, {
      size: this.size(variant === 'tech' ? 13.5 : 15),
      font: variant === 'tech' ? 'bold' : 'serifBold',
      color: sidebarInk,
    }) + 2;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, sideX, this.cursorY + 2, sideW, {
        size: this.size(8.8),
        color: sidebarMuted,
        lineGap: 1.5,
      }) + 8;
    }

    const contactParts = [header.email, header.phone, header.location].filter(Boolean) as string[];
    if (contactParts.length) {
      this.cursorY += this.text.draw(contactParts.join('\n'), sideX, this.cursorY, sideW, {
        size: this.size(8),
        color: sidebarMuted,
        lineGap: 2,
      }) + 4;
    }

    const sideTypes =
      variant === 'tech'
        ? [CvSectionType.SKILLS, CvSectionType.CERTIFICATIONS, CvSectionType.LANGUAGES]
        : [CvSectionType.SKILLS, CvSectionType.LANGUAGES];

    for (const type of sideTypes) {
      const section = sections.find((s) => s.type === type && s.visible && (s.items.length || s.body));
      if (!section) continue;
      this.cursorY += 12;
      this.cursorY += this.text.draw(section.title.toUpperCase(), sideX, this.cursorY, sideW, {
        size: this.size(8.2),
        font: 'bold',
        color: variant === 'tech' ? this.accent : [1, 1, 1],
        charSpace: 1,
      }) + 6;

      if (type === CvSectionType.SKILLS) {
        for (const skill of section.items.slice(0, 16)) {
          this.cursorY += this.text.draw(skill.title ?? '', sideX, this.cursorY, sideW, {
            size: this.size(8.6),
            color: sidebarInk,
            font: variant === 'tech' ? 'mono' : 'regular',
          }) + (variant === 'tech' ? 4 : 5);
          if (variant === 'tech') {
            const rating = Math.min(5, Math.max(1, skill.level ?? 3));
            this.doc.roundedRect(sideX, this.cursorY - 2, sideW, 2.4, 1.2).fill(css(lighten(this.accent, 0.7)));
            this.doc.roundedRect(sideX, this.cursorY - 2, (sideW * rating) / 5, 2.4, 1.2).fill(css(this.accent));
            this.cursorY += 6;
          }
        }
      } else if (type === CvSectionType.LANGUAGES) {
        for (const lang of section.items.slice(0, 8)) {
          this.cursorY += this.text.draw(
            lang.subtitle ? `${lang.title} — ${lang.subtitle}` : (lang.title ?? ''),
            sideX,
            this.cursorY,
            sideW,
            { size: this.size(8.4), color: sidebarMuted, lineGap: 2 },
          ) + 2;
        }
      } else {
        for (const item of section.items.slice(0, 10)) {
          this.cursorY += this.text.draw(item.title ?? '', sideX, this.cursorY, sideW, {
            size: this.size(8.5),
            color: sidebarInk,
            lineGap: 2,
          }) + 1;
          if (item.subtitle) {
            this.cursorY += this.text.draw(item.subtitle, sideX, this.cursorY, sideW, {
              size: this.size(7.8),
              color: sidebarMuted,
              lineGap: 2,
            }) + 3;
          }
        }
      }
    }

    // ── Main column ──
    this.colX = mainX;
    this.colW = mainW;
    this.cursorY = 46;
    const sidebar = { width: sidebarWidth, fill: sidebarFill };

    this.linksRow(header, { color: lighten(this.accent, 0.1) });
    this.cursorY += 10;

    const mainSections = sections.filter((s) => !sideTypes.includes(s.type));
    for (const section of mainSections) {
      if (!section.visible) continue;
      if (section.type === CvSectionType.SUMMARY) {
        if (!section.body) continue;
        this.ensureHeadingRoom(sidebar);
        this.cursorY = Math.max(this.cursorY, 46);
        this.heading(section, { size: variant === 'creative' ? 11.2 : 10 });
        this.cursorY += this.text.draw(section.body, mainX, this.cursorY, mainW, this.bodyStyle()) + 10;
        continue;
      }
      if (!section.items.length) continue;
      this.ensureHeadingRoom(sidebar);
      this.heading(section, { size: variant === 'creative' ? 11.2 : 10 });
      for (const item of section.items) this.entry(item);
      this.cursorY += 2;
    }

    this.cursorY = Math.max(this.cursorY, savedY);
  }

  private layoutTimeline(): void {
    const header = this.options.document.header;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX;

    this.cursorY += this.text.draw(header.fullName, this.colX, this.cursorY, this.colW, {
      size: this.size(20.5),
      font: 'bold',
    }) + 2;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, this.colX, this.cursorY + 2, this.colW, {
        size: this.size(10.3),
        color: this.accent,
      }) + 3;
    }
    this.contactRow(header);
    this.linksRow(header);
    this.cursorY += 12;
    this.sectionsInOrder(this.options.document.sections, { timeline: true });
  }

  private layoutSkillsGrid(): void {
    const header = this.options.document.header;
    const sections = this.options.document.sections;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX;

    this.cursorY += this.text.draw(header.fullName, this.colX, this.cursorY, this.colW, {
      size: this.size(20),
      font: 'bold',
    }) + 2;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, this.colX, this.cursorY + 2, this.colW, {
        size: this.size(10.2),
        color: this.accent,
      }) + 3;
    }
    this.contactRow(header);
    this.linksRow(header);
    this.cursorY += 12;

    const skillSection = sections.find((s) => s.type === CvSectionType.SKILLS && s.visible && s.items.length);
    if (skillSection) {
      this.ensureHeadingRoom();
      this.heading(skillSection);
      this.skillPills(skillSection, { filled: true });
      this.cursorY += 6;
    }
    this.sectionsInOrder(sections, { skip: [CvSectionType.SKILLS] });
  }

  private layoutJunior(): void {
    const header = this.options.document.header;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX;

    this.doc.roundedRect(this.colX, this.cursorY, this.colW, 78, 12).fill(css(lighten(this.accent, 0.88)));
    this.text.draw(header.fullName, this.colX + 18, this.cursorY + 16, this.colW - 36, {
      size: this.size(19),
      font: 'bold',
    });
    if (header.headline) {
      this.text.draw(header.headline, this.colX + 18, this.cursorY + 44, this.colW - 36, {
        size: this.size(9.8),
        color: lighten(this.accent, 0.05),
      });
    }
    this.cursorY += 92;
    this.cursorY += 14;
    this.contactRow(header);
    this.linksRow(header);
    this.cursorY += 10;
    this.sectionsInOrder(this.options.document.sections);
  }

  private layoutExecutive(): void {
    const header = this.options.document.header;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX;

    this.doc.rect(this.colX, this.cursorY, this.colW, 1.6).fill(css(this.accent));
    this.cursorY += 18;
    this.cursorY += this.text.draw(header.fullName, this.colX, this.cursorY, this.colW, {
      size: this.size(22.5),
      font: 'serifBold',
      charSpace: 0.4,
    }) + 2;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, this.colX, this.cursorY + 2, this.colW, {
        size: this.size(10.6),
        font: 'serif',
        color: this.accent,
        charSpace: 0.5,
      }) + 4;
    }
    this.contactRow(header, { size: 8.5 });
    this.linksRow(header);
    this.cursorY += 8;
    this.doc.strokeColor(css(lighten(this.accent, 0.55))).lineWidth(0.6).moveTo(this.colX, this.cursorY).lineTo(this.colX + this.colW, this.cursorY).stroke();
    this.cursorY += 14;
    this.sectionsInOrder(this.options.document.sections, { headingSize: 10.4 });
  }

  private layoutInternational(): void {
    const header = this.options.document.header;
    this.colX = this.template.pageMargin;
    this.colW = A4.width - this.colX * 2;
    this.cursorY = this.colX;

    this.cursorY += this.text.draw(header.fullName.toUpperCase(), this.colX, this.cursorY, this.colW, {
      size: this.size(14.5),
      font: 'bold',
      charSpace: 1.6,
    }) + 3;
    if (header.headline) {
      this.cursorY += this.text.draw(header.headline, this.colX, this.cursorY + 2, this.colW, {
        size: this.size(10),
        color: this.muted,
      }) + 6;
    }
    this.contactRow(header, { size: 8.3 });
    this.linksRow(header);
    this.cursorY += 12;
    this.sectionsInOrder(this.options.document.sections);
  }
}

export async function renderCvPdf(options: RenderOptions): Promise<Buffer> {
  return new CvPdfRenderer(options).render();
}
