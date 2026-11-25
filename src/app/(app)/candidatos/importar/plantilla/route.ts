import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { csvCell } from "@/lib/import/csv";
import { IMPORT_COLUMNS } from "@/modules/candidates/schema";

/** Plantilla CSV (orden de la ficha) con una fila de ejemplo ficticia. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "coordinador")) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const example = ["Ana", "Ficticia Mora", "8888-0000", "ana.ficticia@correo.test", "San José", "Escazú", "San Rafael", "Barrio ficticio", "Ejecutivo(a) de ventas", "WhatsApp", "", ""];
  const body = "﻿" + [IMPORT_COLUMNS.map((c) => c.header).join(","), example.map(csvCell).join(",")].join("\r\n") + "\r\n";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-candidatos-tpc.csv"',
      "Cache-Control": "no-store",
    },
  });
}
