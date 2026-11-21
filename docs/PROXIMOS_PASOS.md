# Próximos pasos (requieren autorización)

La fase 1 dejó la base técnica. Propuesta para las siguientes fases:

## Fase 2 — Operación diaria
- Formularios de alta y edición (Server Actions + Zod) para los cinco módulos.
- Vistas de detalle y búsqueda/filtros/paginación en las tablas.
- Flujo de aprobación de requisiciones y creación de vacantes desde requisiciones aprobadas.
- Tablero kanban de postulaciones por etapa.
- Gestión de usuarios y roles (pantalla de administración, invitaciones por correo de Supabase).
- Tipos generados con `supabase gen types`.

## Fase 3 — Documentos y comunicación
- Carga de currículos en Supabase Storage (bucket privado con RLS).
- Registro de entrevistas, notas y evaluaciones.
- Notificaciones por correo (servicio con plan gratuito, a evaluar).

## Fase 4 — Portal y analítica
- Portal público de vacantes y postulación en línea con consentimiento explícito (Ley 8968).
- Reportes: tiempo de contratación, fuentes, desempeño por reclutador y cliente.
- Política de retención y anonimización de datos.

## Pendientes de configuración (antes de producción)
- Crear el proyecto Supabase y aplicar migraciones.
- Desactivar el registro público en Supabase Auth.
- Configurar dominio y variables en Cloudflare.
- Revisar con asesoría legal el tratamiento de datos personales.
