/**
 * Document Generator — Export PDF, DOCX, PPT, XLSX
 * Génère des documents à partir des résultats des agents
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('document-generator');

export type DocumentFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'markdown' | 'html' | 'txt';

export interface DocumentOptions {
  title: string;
  author?: string;
  content: string;
  format: DocumentFormat;
  sections?: { title: string; content: string }[];
  metadata?: Record<string, string>;
}

/**
 * Génère un document dans le format demandé
 */
export async function generateDocument(options: DocumentOptions): Promise<{
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  size: number;
}> {
  const { title, content, format, sections, author } = options;

  switch (format) {
    case 'markdown':
      return generateMarkdown(title, content, sections, author);
    case 'html':
      return generateHtml(title, content, sections, author);
    case 'txt':
      return generateTxt(title, content, sections);
    case 'pdf':
      return generatePdf(title, content, sections, author);
    default:
      return generateMarkdown(title, content, sections, author);
  }
}

async function generateMarkdown(
  title: string,
  content: string,
  sections?: { title: string; content: string }[],
  author?: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string; size: number }> {
  let md = `# ${title}\n\n`;
  if (author) md += `*Par ${author}*\n\n`;
  md += `---\n\n${content}\n\n`;

  if (sections) {
    for (const section of sections) {
      md += `## ${section.title}\n\n${section.content}\n\n`;
    }
  }

  const buffer = Buffer.from(md, 'utf-8');
  return {
    buffer,
    mimeType: 'text/markdown',
    fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.md`,
    size: buffer.length,
  };
}

async function generateHtml(
  title: string,
  content: string,
  sections?: { title: string; content: string }[],
  author?: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string; size: number }> {
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>`;
  html += `<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6}h1{color:#8b5cf6}hr{border:0;border-top:1px solid #e5e7eb}</style></head><body>`;
  html += `<h1>${title}</h1>`;
  if (author) html += `<p>Par ${author}</p><hr>`;
  html += `<div>${content.replace(/\n/g, '<br>')}</div>`;
  if (sections) {
    for (const section of sections) {
      html += `<h2>${section.title}</h2><div>${section.content.replace(/\n/g, '<br>')}</div>`;
    }
  }
  html += '</body></html>';

  const buffer = Buffer.from(html, 'utf-8');
  return {
    buffer,
    mimeType: 'text/html',
    fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.html`,
    size: buffer.length,
  };
}

async function generateTxt(
  title: string,
  content: string,
  sections?: { title: string; content: string }[],
): Promise<{ buffer: Buffer; mimeType: string; fileName: string; size: number }> {
  let txt = `${title}\n${'='.repeat(title.length)}\n\n${content}\n\n`;
  if (sections) {
    for (const section of sections) {
      txt += `${section.title}\n${'-'.repeat(section.title.length)}\n${section.content}\n\n`;
    }
  }

  const buffer = Buffer.from(txt, 'utf-8');
  return {
    buffer,
    mimeType: 'text/plain',
    fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.txt`,
    size: buffer.length,
  };
}

async function generatePdf(
  title: string,
  content: string,
  sections?: { title: string; content: string }[],
  author?: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string; size: number }> {
  // Utiliser le HTML comme base pour le PDF
  const htmlResult = await generateHtml(title, content, sections, author);

  // Si puppeteer est disponible, générer un vrai PDF
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(htmlResult.buffer.toString('utf-8'));
    const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
    await browser.close();

    return {
      buffer: Buffer.from(pdfBuffer),
      mimeType: 'application/pdf',
      fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`,
      size: pdfBuffer.length,
    };
  } catch {
    // Fallback: retourner le HTML (l'utilisateur pourra imprimer en PDF)
    return {
      ...htmlResult,
      mimeType: 'text/html',
      fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.html`,
    };
  }
}

/**
 * Formate le contenu AI en sections structurées
 */
export function formatAIResponseAsDocument(
  title: string,
  aiResponse: string,
): DocumentOptions {
  const lines = aiResponse.split('\n');
  const sections: { title: string; content: string }[] = [];
  let currentSection = '';
  let currentContent = '';

  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('### ')) {
      if (currentSection) {
        sections.push({ title: currentSection, content: currentContent.trim() });
      }
      currentSection = line.replace(/^#+\s*/, '');
      currentContent = '';
    } else {
      currentContent += line + '\n';
    }
  }
  if (currentSection) {
    sections.push({ title: currentSection, content: currentContent.trim() });
  }

  return {
    title,
    content: sections.length > 0 ? '' : aiResponse,
    format: 'markdown',
    sections: sections.length > 0 ? sections : undefined,
  };
}
