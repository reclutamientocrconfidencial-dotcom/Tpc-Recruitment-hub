# Plan maestro (cada fase requiere autorización)

| Fase | Tema | Estado |
|---|---|---|
| 1 | Base técnica, autenticación, dashboard, esquema, RLS | ✅ Completada y publicada |
| 2 | Operación diaria de los cinco módulos | 📋 Plan aprobado — ver [FASE2_PLAN.md](FASE2_PLAN.md) |
| 3 | Documentos y comunicación | Propuesta |
| 4 | Portal y analítica | Propuesta |
| 5–7 | Por definir con la empresa (lector de CV, IA, entrevistas dinámicas, informes ejecutivos, exportaciones, comunicaciones automatizadas) | Por definir |
| 8 | Mantenimiento, respaldos, monitoreo, recuperación y continuidad | Requisito transversal **desde la fase 2**; consolidación en fase 8 |

## Fase 2 — Operación diaria
Detalle completo y aprobado en [FASE2_PLAN.md](FASE2_PLAN.md).

## Fase 3 — Documentos y comunicación
- Carga de currículos en Supabase Storage (bucket privado con RLS).
- Registro de entrevistas, notas y evaluaciones.
- Notificaciones por correo (servicio con plan gratuito, a evaluar).

## Fase 4 — Portal y analítica
- Portal público de vacantes y postulación en línea con consentimiento explícito (Ley 8968).
- Reportes: tiempo de contratación, fuentes, desempeño por reclutador y cliente.
- Política de retención y anonimización de datos.

## Fases 5–7 — Por definir
Alcance a acordar con la empresa. La fase 2 deja la arquitectura preparada (ver §9 de FASE2_PLAN.md).

## Fase 8 — Mantenimiento, respaldos, monitoreo, recuperación y continuidad operativa

**Objetivo:** que el sistema siga operando, que la información pueda recuperarse ante un fallo y que los problemas
se detecten antes que los usuarios, usando solo planes gratuitos salvo autorización expresa.

Estos requisitos **se incorporan de forma progresiva desde la fase 2** (ver §15 de FASE2_PLAN.md) y la fase 8 los
consolida, documenta y prueba de extremo a extremo.

### 8.1 Respaldos
- Supabase gratuito **no ofrece respaldos descargables ni restauración a un punto en el tiempo**: se requiere un
  respaldo propio.
- Respaldo lógico programado (`pg_dump`) ejecutado con GitHub Actions (gratuito), **cifrado antes de guardarse**
  (clave pública; la clave privada la custodia la empresa fuera de GitHub) y con retención limitada.
- Respaldo de la configuración: migraciones y código ya están versionados en GitHub.
- Archivos (fase 3): respaldo del bucket de Storage con el mismo esquema de cifrado.
- Requiere autorización: credencial de solo lectura de la base de datos como secreto de GitHub.

### 8.2 Recuperación ante fallos
- Objetivos a acordar con la empresa: **RPO** (pérdida máxima de datos aceptable) y **RTO** (tiempo máximo sin
  servicio).
- Restauración documentada paso a paso y **probada periódicamente en el proyecto de pruebas**, nunca en producción.
- Aplicación: volver a la versión anterior desde Cloudflare (*Deployments → Rollback*) en minutos.
- Base de datos: migraciones aditivas y con instrucciones de reversión.

### 8.3 Monitoreo y alertas
- Ruta de salud `/api/salud` que verifica aplicación y base de datos **sin exponer datos**.
- Verificación programada (GitHub Actions) que alerta por correo de GitHub si el sistema no responde.
- Métricas y registros de Cloudflare Workers (observabilidad ya activada): errores, CPU y solicitudes frente a
  los límites gratuitos.
- Supabase: uso de base de datos (500 MB) y advertencias del *Security Advisor*.
- Prevención de la **pausa por inactividad** de Supabase gratuito (7 días).

### 8.4 Mantenimiento
- Actualización mensual de dependencias con `npm audit` y CI completa.
- Revisión trimestral de usuarios, roles y accesos a datos sensibles.
- Limpieza según la política de retención de datos personales (Ley 8968).
- Registro de cambios por versión.

### 8.5 Continuidad operativa
- Manual de operación (`docs/OPERACION.md`): contactos, cuentas y responsables, procedimientos de incidente.
- Al menos **dos administradores** con acceso a Supabase, Cloudflare y GitHub (sin compartir contraseñas;
  verificación en dos pasos activada).
- Procedimiento de traspaso si cambia el personal responsable.
- Plan de contingencia: cómo operar mientras el sistema esté fuera de servicio y cómo reincorporar la información.

## Pendientes de configuración
- ✅ Proyecto Supabase creado, migraciones 0100–0700 aplicadas, registro público desactivado, administrador creado.
- ✅ Publicación en Cloudflare Workers con `main` como rama de producción.
- ⏳ Proyecto Supabase de pruebas (aprobado).
- ⏳ Revisión con asesoría legal del tratamiento de datos personales y del texto de consentimiento.
- ⏳ Activar verificación en dos pasos en GitHub, Supabase y Cloudflare.
