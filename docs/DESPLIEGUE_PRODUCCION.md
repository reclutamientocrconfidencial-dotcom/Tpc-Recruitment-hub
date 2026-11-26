# Plan de despliegue a producción — TPC Recruitment Hub v1.0

> **Nada de este plan se ejecuta sin autorización expresa de la gerencia.** Producción hoy: Supabase con migraciones
> **0100–0700** (fase 1) y Worker `tpc-recruitment-hub` publicando `main` (fase 1). Todo lo demás está en PR abiertos
> (#3 a #13 y la rama de la fase 8) y probado en TEST con datos ficticios.

## 1. Pendientes reales

### 1.1 Bloquean el uso con datos reales (responsable: la empresa)
| # | Pendiente | Referencia |
|---|---|---|
| 1 | Verificación en dos pasos configurada por **todo** el equipo y **exigida** en *Administración → Seguridad* | OPERACION §7 |
| 2 | Verificación en dos pasos en GitHub, Supabase y Cloudflare; **dos administradores** por servicio; tabla de responsables completa | OPERACION §2 |
| 3 | **Revisión jurídica (Ley 8968):** consentimiento, finalidades, plazos de retención, protocolo de incidentes, inscripción ante PRODHAB si corresponde | SEGURIDAD · OPERACION §6 |
| 4 | Clave GPG de respaldos (dos custodios) y secretos de respaldo de **producción** (base y archivos); una restauración de prueba documentada | OPERACION §8 |
| 5 | Aprobar RPO/RTO (propuesta: 24 h / 1 día hábil) | OPERACION §8.3 |

### 1.2 Pendientes en TEST (responsable: la empresa, con mi acompañamiento)
| # | Pendiente |
|---|---|
| 6 | ✅ Migraciones 1700 y 1800 aplicadas y verificadas en TEST; auditoría de seguridad superada |
| 7 | ✅ Worker de TEST publica la rama de la fase 8 |
| 8 | **Validación manual (aceptación de usuario)** de las fases 3 a 8 con datos ficticios, por un reclutador, una coordinadora y un administrador |
| 9 | Configurar `MONITOREO_URLS` (TEST) y seguir el repositorio para recibir alertas |

### 1.3 Mejoras que dependen de insumos de la empresa (no bloquean)
| # | Pendiente |
|---|---|
| 10 | Documento ejecutivo y **logotipo oficial** de TPC para ajustar el diseño de los informes |
| 11 | Plazos de retención aprobados → eliminación o anonimización automática |
| 12 | Capturas de pantalla para los manuales (con datos ficticios) |
| 13 | IA con proveedor externo: solo con acuerdo de tratamiento de datos firmado y presupuesto aprobado |
| 14 | Documentos escaneados: hoy se completan a mano; un OCR implicaría un servicio adicional (requiere autorización y costos) |

## 2. Estrategia de publicación

- **Una sola ventana de despliegue**, con respaldo previo y la aplicación anterior lista para *Rollback*.
- Primero la base (migraciones aditivas y compatibles con el código actual) y después la aplicación.
- Los PR están **encadenados**: se fusionan en orden (#3 → #4 → #5 → #6 → #7 → #8 → #9 → #10 → #11 → #12 → #13 → fase 8).
  Al fusionar uno y borrar su rama, GitHub cambia automáticamente la base del siguiente a `main`.
- Para que Cloudflare no publique versiones intermedias, se **pausan las compilaciones automáticas** de producción
  mientras se fusiona la cadena y se publica una sola vez al final.

## 3. Pasos (día del despliegue)

### Fase A — Preparación (días antes)
1. Completar los pendientes 1 a 9 y obtener la autorización escrita de la gerencia.
2. Ejecutar en TEST `supabase/verification/auditoria_seguridad.sql`: todo «ok».
3. Generar la **clave de formularios de producción** (distinta de TEST) en un equipo de confianza (OPERACION §9.1).
4. En el proyecto Supabase de producción, *Authentication*: registro público **desactivado** (ya lo está), *Site URL*
   y *Redirect URLs* con el dominio de producción, **TOTP (MFA) habilitado**.

### Fase B — Base de datos de producción (≈ 1 hora)
5. **Respaldo** manual inmediato de producción (OPERACION §8; *Run workflow*) y confirmar el artefacto.
6. Confirmar el **nombre del proyecto de producción** arriba a la izquierda en Supabase.
7. En el *SQL Editor*, aplicar **una por una y en orden** las migraciones, ejecutando después de cada una su
   verificación (`supabase/verification/<número>_verificar.sql`). Si alguna verificación falla: **detenerse** y
   avisar; no continuar.

| Orden | Migración | Verificación |
|---|---|---|
| 1 | `20261123000800_fase2a_configuracion.sql` | `0800_verificar.sql` |
| 2 | `20261124000810_fase2a_catalogos.sql` | `0810_verificar.sql` |
| 3 | `20261125000820_fase2b_requisiciones_vacantes.sql` | `0820_verificar.sql` |
| 4 | `20261126000830_editar_requisitos_catalogo.sql` | `0830_verificar.sql` |
| 5 | `20261127000840_plazas_autorizadas.sql` | `0840_verificar.sql` |
| 6 | `20261128000900_s1_seguridad.sql` | `0900_verificar.sql` |
| 7 | `20261129001000_fase2c_candidatos.sql` | `1000_verificar.sql` |
| 8 | `20261130001100_fase2d_postulaciones.sql` | `1100_verificar.sql` |
| 9 | `20261201001200_fase3_recepcion.sql` | `1200_verificar.sql` |
| 10 | `20261202001300_fase4_evaluaciones.sql` | `1300_verificar.sql` |
| 11 | `20261203001400_fase5_ia.sql` | `1400_verificar.sql` |
| 12 | `20261204001500_fase6_jornada.sql` | `1500_verificar.sql` |
| 13 | `20261205001600_fase7_indicadores.sql` | `1600_verificar.sql` |
| 14 | `20261206001700_mejoras_evaluacion_ia.sql` | `1700_verificar.sql` |
| 15 | `20261207001800_fase8_salud.sql` | `1800_verificar.sql` |

8. Configurar la clave de formularios: `select private.set_public_form_key('<clave de producción>');`.
9. Ejecutar `auditoria_seguridad.sql` en producción: todo «ok»; «datos reales habilitados: no».

### Fase C — Aplicación (≈ 1 hora)
10. Cloudflare → `tpc-recruitment-hub` → *Settings → Build*: pausar las compilaciones automáticas.
11. Variables del Worker de producción (*Settings → Variables and Secrets*): `NEXT_PUBLIC_SUPABASE_URL` y
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (de producción, también como variables de compilación),
    `NEXT_PUBLIC_SITE_URL` (dominio) y el **secreto** `PUBLIC_FORM_KEY`. Nunca la clave secreta de Supabase.
12. Fusionar la cadena de PR en orden (con la CI en verde en cada uno).
13. Reactivar las compilaciones y publicar `main` una sola vez; confirmar en `/api/salud`: `"estado":"ok"` y la
    versión (commit) esperada.

### Fase D — Verificación posterior (≈ 30 minutos)
14. Prueba de humo con una cuenta administradora (con verificación en dos pasos): inicio de sesión, tablero,
    clientes, una requisición y vacante **ficticias** (luego desactivarlas), formulario público con un envío ficticio
    que se descarta, exportación de un informe de prueba.
15. Activar en GitHub los secretos de respaldo de producción y `MONITOREO_URLS` con el dominio de producción;
    ejecutar *Respaldo cifrado* y *Monitoreo* manualmente: ambos en verde.
16. Registrar el despliegue (fecha, versión, responsables, resultado de verificaciones) en la bitácora de operación.

### Fase E — Datos reales (solo con autorización aparte)
17. Con los pendientes 1 a 5 cumplidos: administración activa «datos reales» en *Administración → Seguridad* y se
    inicia la carga (importación controlada de candidatos con consentimiento vigente).

## 4. Criterios para detener y volver atrás
- Cualquier verificación SQL con «FALLA», error en `/api/salud` o hallazgo crítico/alto → **detener**.
- Aplicación: *Rollback* en Cloudflare a la versión anterior (OPERACION §4). Las migraciones son aditivas: la versión
  anterior funciona con la base nueva.
- Base de datos: solo si es imprescindible, reversión documentada por migración (OPERACION §5) o restauración desde
  el respaldo del paso 5, con autorización de la gerencia.

## 5. Después del despliegue
- Mantenimiento periódico: OPERACION §13 (respaldos, monitoreo, Dependabot, auditoría trimestral).
- Capacitación con los manuales: [usuario](manual/usuario.md) y [administración](manual/administracion.md).
