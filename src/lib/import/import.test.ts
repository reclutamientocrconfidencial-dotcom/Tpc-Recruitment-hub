import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { csvCell, parseCsv } from "@/lib/import/csv";
import { parseXlsx } from "@/lib/import/xlsx";
import { mapHeaders, matchProvince, normalizeImportRow } from "@/modules/candidates/schema";

describe("CSV", () => {
  it("comas, punto y coma, comillas, BOM y saltos de línea", () => {
    expect(parseCsv('﻿nombre,apellidos\r\nAna,"Ficticia, Mora"\n"Luis ""Lucho""","Línea\nDos"\n\n')).toEqual([
      ["nombre", "apellidos"],
      ["Ana", "Ficticia, Mora"],
      ['Luis "Lucho"', "Línea\nDos"],
    ]);
    expect(parseCsv("nombre;apellidos\nAna;Mora")).toEqual([["nombre", "apellidos"], ["Ana", "Mora"]]);
  });
  it("celdas seguras contra inyección de fórmulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("Mora, Ana")).toBe('"Mora, Ana"');
  });
});

describe("Excel (.xlsx)", () => {
  it("lee textos compartidos, texto en línea y números sin decimales", () => {
    const xlsx = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/sharedStrings.xml": strToU8("<sst><si><t>nombre</t></si><si><t>cedula</t></si><si><r><t>Ana </t></r><r><t>María</t></r></si></sst>"),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>102340567</v></c></row>' +
          '<row r="3"><c r="A3" t="inlineStr"><is><t>Luis &amp; Co</t></is></c></row></sheetData></worksheet>',
      ),
    });
    expect(parseXlsx(xlsx)).toEqual([
      ["nombre", "", "cedula"],
      ["Ana María", "", "102340567"],
      ["Luis & Co"],
    ]);
  });
});

describe("filas de importación", () => {
  const catalogs = {
    cantons: [
      { province: "San José", name: "Escazú" },
      { province: "Limón", name: "Pococí" },
    ],
    channels: [{ id: "66666666-0000-4000-8000-000000000001", name: "WhatsApp" }],
  };
  it("encabezados sin tildes ni mayúsculas y columnas obligatorias", () => {
    const { map, missing } = mapHeaders(["Nombre", "Apellidos", "Teléfono", "Correo electrónico", "Cantón"]);
    expect(map).toMatchObject({ first_name: 0, last_name: 1, phone: 2, email: 3, canton: 4 });
    expect(missing).toEqual([]);
    expect(mapHeaders(["correo"]).missing).toEqual(["Nombre", "Apellidos"]);
  });
  it("normaliza provincia, cantón (deduce la provincia) y fuente", () => {
    const r = normalizeImportRow({ row_number: 2, values: { first_name: "Ana", last_name: "Mora", canton: "pococi", source: "whatsapp", national_id: "1-0234-0567" } }, catalogs);
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({ canton: "Pococí", province: "Limón", intake_channel_id: catalogs.channels[0]!.id, national_id_type: "cedula" });
    expect(matchProvince("SAN JOSE")).toBe("San José");
  });
  it("informa errores por fila", () => {
    const r = normalizeImportRow({ row_number: 3, values: { first_name: "", last_name: "X", email: "no-es-correo", province: "Atlántida", source: "Fax" } }, catalogs);
    expect(r.errors).toEqual(["Nombre: obligatorio.", "Correo inválido.", "Provincia desconocida: «Atlántida».", "Fuente desconocida: «Fax» (use un nombre del catálogo de fuentes)."]);
  });
});
