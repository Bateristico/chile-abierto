import { PDFParse } from "pdf-parse";

export interface PdfPage {
  num: number;
  text: string;
}

export async function pdfPages(data: Uint8Array): Promise<PdfPage[]> {
  const parser = new PDFParse({ data });
  try {
    const res = await parser.getText();
    return res.pages.map((p: { num: number; text: string }) => ({ num: p.num, text: p.text }));
  } finally {
    await parser.destroy();
  }
}

/** Collapse whitespace and hyphenated line breaks so names that wrap across lines still match. */
export function normaliseText(s: string): string {
  return s.replace(/-\n/g, "").replace(/\s+/g, " ").trim();
}
