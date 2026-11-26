# Informes de muestra (datos 100 % ficticios)

Generados por `src/lib/report/report.test.ts` con los perfiles de `tests/fixtures/` para revisar el diseño del
informe ejecutivo v2 y del comparativo de terna en PDF y Word:

| Perfil | PDF | Word |
|---|---|---|
| Operativo (operario de bodega) | [informe-operativo.pdf](informe-operativo.pdf) | [informe-operativo.docx](informe-operativo.docx) |
| Administrativo (asistente contable) | [informe-administrativo.pdf](informe-administrativo.pdf) | [informe-administrativo.docx](informe-administrativo.docx) |
| Técnico (mantenimiento industrial) | [informe-tecnico.pdf](informe-tecnico.pdf) | [informe-tecnico.docx](informe-tecnico.docx) |
| Comercial (ejecutiva B2B) | [informe-comercial.pdf](informe-comercial.pdf) | [informe-comercial.docx](informe-comercial.docx) |
| Terna comparativa | [terna.pdf](terna.pdf) | [terna.docx](terna.docx) |

Para regenerarlos: `REPORT_SAMPLES_DIR=docs/muestras npx vitest run src/lib/report`.
