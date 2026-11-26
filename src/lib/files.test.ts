import { describe, expect, it } from "vitest";
import { detectCvType, detectDocumentType, formatBytes, safeFileName, validateCv, validateDocument, CV_MAX_BYTES } from "@/lib/files";
import { qrSvg } from "@/lib/qr";

const enc = (s: string) => new TextEncoder().encode(s);

describe("validación de currículums por contenido", () => {
  it("reconoce un PDF por su firma", () => {
    expect(detectCvType(enc("%PDF-1.7\n..."))).toBe("application/pdf");
  });
  it("reconoce un DOCX (ZIP con carpeta word/)", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc("....[Content_Types].xml....word/document.xml")]);
    expect(detectCvType(bytes)).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
  it("rechaza un ZIP que no es Word, ejecutables y archivos renombrados", () => {
    expect(detectCvType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc("otro/archivo.txt")]))).toBeNull();
    expect(detectCvType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]))).toBeNull();
    expect(detectCvType(enc("<html><script>alert(1)</script></html>"))).toBeNull();
  });
  it("valida vacío y tamaño máximo (5 MB)", () => {
    expect(validateCv(new Uint8Array()).error).toMatch(/vacío/);
    const big = new Uint8Array(CV_MAX_BYTES + 1);
    big.set(enc("%PDF-1.4"));
    expect(validateCv(big).error).toMatch(/5 MB/);
    expect(validateCv(enc("%PDF-1.4 contenido")).mime).toBe("application/pdf");
  });
  it("limpia nombres de archivo (sin rutas ni caracteres peligrosos)", () => {
    expect(safeFileName("../../etc/<script>CV Núñez.pdf")).toBe("scriptCV Núñez.pdf");
    expect(safeFileName("C:\\Users\\x\\hoja de vida.docx")).toBe("hoja de vida.docx");
    expect(safeFileName("///")).toBe("curriculum");
  });
  it("formatea tamaños", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});

describe("respaldos de credenciales", () => {
  it("acepta fotos JPG/PNG por su firma y rechaza lo demás", () => {
    expect(detectDocumentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(detectDocumentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectDocumentType(enc("%PDF-1.7 x"))).toBe("application/pdf");
    expect(validateDocument(enc("GIF89a......")).error).toMatch(/JPG o PNG/);
  });
});

describe("código QR", () => {
  it("genera un SVG autocontenido con el título escapado", () => {
    const svg = qrSvg("https://tpc.example/p/abc123def456", { title: 'Enlace "feria" <x>' });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<title>Enlace feria x</title>");
    expect(svg).toMatch(/<path fill="#000000" d="M\d/);
    expect(svg).not.toContain("<script");
  });
  it("es determinista para el mismo enlace", () => {
    expect(qrSvg("https://tpc.example/p/x")).toBe(qrSvg("https://tpc.example/p/x"));
  });
});
