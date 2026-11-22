# Plan de implementación — Fase 2

**TPC Recruitment Hub · The People Outsourcing Company S.A.**
Estado: **aprobado con ajustes** (pendiente de iniciar programación).
Principios: seguridad por defecto · confidencialidad · diseño corporativo rojo/blanco/negro · solo planes gratuitos ·
**exclusivamente datos ficticios** hasta autorización expresa.

---

## 1. Decisiones aprobadas

| # | Tema | Decisión |
|---|---|---|
| 1 | Rol `consulta` | **Opción B.** No ve cédula, teléfono, correo, documentos, pretensión salarial ni observaciones confidenciales. Se restringe **en la base de datos** (no solo en la interfaz). |
| 2 | Kanban | **Opción A.** Cambio de etapa por selector/botones: liviano, accesible y rápido. Sin librerías de arrastre. |
| 3 | Duplicados | Datos normalizados (cédula, correo, teléfono). **Bloqueo** de cédula duplicada confirmada; coincidencias de correo/teléfono se presentan para **revisión humana**. Un candidato = un expediente, con múltiples postulaciones. |
| 4 | Ambiente de pruebas | Segundo proyecto **gratuito** de Supabase, exclusivo para pruebas con datos ficticios. |
| 5 | Entregas | Tres PR: **2A → 2B → 2C**. |
| 6 | Configuración | Requisitos de vacante y etapas del proceso **configurables por cliente y por posición**. |
| 7 | Plantillas | Reutilizar requisiciones y vacantes anteriores como plantillas. |
| 8 | Seguimiento | Responsables, fechas límite, pendientes y próximos pasos. |
| 9 | Fuentes | WhatsApp, correo, redes sociales, plataformas de empleo, ferias, formularios y referencias. |
| 10 | Arquitectura futura | Preparada para lector de CV, IA, entrevistas dinámicas, informes ejecutivos, exportaciones controladas y comunicaciones automatizadas. |
| 11 | Protección de datos | Consentimiento informado, trazabilidad y protección de datos son **requisitos obligatorios** (Ley N.° 8968). |

---

## 2. Alcance funcional por módulo

Común a todos: listado paginado en servidor (25 por página), búsqueda y filtros persistidos en la URL, vista de
detalle, alta y edición con validación Zod (navegador + servidor), mensajes claros en español, accesible por teclado
y utilizable en celular.

### 2.1 Clientes (PR 2A)
- Alta/edición: admin y coordinador. **Desactivar** en lugar de eliminar.
- Filtros: nombre, cédula jurídica, estado, provincia, industria, gestor de cuenta.
- Detalle: datos, contactos, requisiciones, vacantes abiertas, **configuración propia** (etapas y requisitos
  predeterminados del cliente, ver §3).

### 2.2 Gestión de usuarios (PR 2A, solo admin)
- Cambiar rol y activar/desactivar perfiles existentes.
- La **creación** de cuentas sigue en el panel de Supabase (la app nunca usa la clave secreta).

### 2.3 Requisiciones (PR 2B)
- Alta/edición: admin y coordinador. Asignación de reclutador responsable.
- **Flujo de aprobación** con transiciones válidas aplicadas en la base de datos:
  `borrador → pendiente_aprobacion → aprobada → en_proceso → cerrada` (o `cancelada`).
  `approved_by` / `approved_at` se registran automáticamente.
- **Usar como plantilla** (§5).
- Filtros: estado, prioridad, cliente, reclutador, fecha meta, vencidas.

### 2.4 Vacantes (PR 2B)
- Se crean **solo desde requisiciones aprobadas o en proceso**.
- Requisitos y etapas heredados de la configuración del cliente/posición y **ajustables por vacante** (§3).
- Publicar, pausar, cerrar, marcar como cubierta (`published_at` automático).
- El reclutador asignado edita las suyas.
- **Usar como plantilla** (§5).
- Filtros: estado, modalidad, provincia, cliente, reclutador, fecha de cierre.

### 2.5 Candidatos (PR 2C)
- Alta/edición: admin, coordinador y reclutador.
- **Consentimiento informado obligatorio** antes de guardar (§7).
- **Detección de duplicados** (§6).
- **Fuente de recepción** obligatoria (§8).
- Expediente único con historial de todas sus postulaciones, consentimientos y accesos.
- Filtros: nombre, provincia, nivel de inglés, experiencia, fuente, etiquetas. La búsqueda por cédula/correo/teléfono
  solo está disponible para roles autorizados.

### 2.6 Postulaciones (PR 2C)
- Vincular candidato a vacante (sin duplicar expediente; un candidato puede estar en varias vacantes).
- **Kanban por vacante** con las etapas configuradas; cambio de etapa por selector/botones.
- **Motivo obligatorio** al descartar. Calificación 1–5.
- Historial completo de etapas (quién, cuándo, desde/hacia, tiempo en etapa).
- Notas internas con nivel de confidencialidad.
- **Próximo paso** y fecha del próximo paso (§4).

---

## 3. Requisitos y etapas configurables (decisión 6)

**Etapas del proceso**
- `pipeline_templates`: plantillas de proceso. `client_id` nulo = plantilla global de TPC; con cliente = propia.
- `pipeline_stages`: etapas ordenadas de cada plantilla (nombre, orden, color, plazo sugerido en días) y una
  **categoría fija** (`nuevo`, `en_proceso`, `oferta`, `contratado`, `descartado`) para que métricas, informes y
  seguridad funcionen igual con cualquier configuración.
- Cada vacante usa una plantilla (la del cliente o la global) y puede ajustarse.
- Las postulaciones guardan `stage_id` (etapa configurable) además de la categoría.

**Requisitos de la vacante**
- `requirement_templates` por cliente y/o posición.
- `vacancy_requirements`: requisito, tipo (**obligatorio / deseable**), categoría (formación, experiencia, idioma,
  certificación, habilidad, disponibilidad, otro), nivel esperado y peso.
- Estructura pensada para que el futuro **lector de CV / IA** compare candidatos contra requisitos (§9).

---

## 4. Responsables, fechas límite, pendientes y próximos pasos (decisión 8)

- `tasks`: título, descripción, **responsable**, **fecha límite**, prioridad, estado
  (`pendiente`, `en_curso`, `completada`, `cancelada`) y vínculo con requisición, vacante, postulación o candidato.
- Postulaciones con **próximo paso** (texto) y **fecha del próximo paso**.
- Vistas: **"Mis pendientes"**, pendientes vencidos y próximos 7 días; indicadores en el dashboard.
- Visibilidad: quien puede ver la entidad vinculada ve sus tareas; el responsable siempre ve las suyas.

---

## 5. Plantillas (decisión 7)

- Acción **"Usar como plantilla"** en requisiciones y vacantes: copia datos, requisitos y etapas, **nunca**
  candidatos ni postulaciones.
- Bandera `is_template` + nombre de plantilla para guardar modelos reutilizables por cliente/posición.
- La copia se realiza en el servidor y queda registrada en la bitácora (origen → copia).

---

## 6. Duplicados de candidatos (decisión 3)

- Columnas normalizadas generadas por la base de datos:
  - **Cédula**: solo dígitos/letras, sin guiones ni espacios, en mayúsculas (cédula, DIMEX o pasaporte con tipo).
  - **Correo**: minúsculas y sin espacios.
  - **Teléfono**: formato E.164 (por defecto `+506` para números de 8 dígitos).
- **Bloqueo**: índice único sobre la cédula normalizada → no puede existir dos veces.
- **Revisión humana**: antes de guardar, una función segura devuelve **solo** "existe un posible duplicado por
  correo/teléfono" y el código del expediente (sin exponer datos personales). El usuario puede:
  1. abrir el expediente existente y postularlo a la nueva vacante, o
  2. confirmar que es otra persona, con justificación registrada en la bitácora.

---

## 7. Consentimiento, trazabilidad y protección de datos (decisiones 1 y 11)

**Separación de datos sensibles (restricción a `consulta` desde la base de datos)**
- Nueva tabla `candidate_private` (1:1 con `candidates`): cédula, correo, teléfono, pretensión salarial,
  observaciones confidenciales. Se **mueven** allí desde `candidates`.
- RLS: solo `admin`, `coordinador` y `reclutador` activos. `consulta` no puede leerla ni por la API.
- Notas de postulación con nivel `interna` / `confidencial`; las confidenciales tampoco son visibles para `consulta`.
- Documentos (CV y anexos, fase 3): bucket **privado** de Supabase Storage con las mismas reglas.

**Consentimiento informado**
- `consent_texts`: textos versionados del consentimiento (redacción a validar con asesoría legal).
- `candidate_consents`: versión aceptada, finalidades (proceso actual, banco de talento, compartir con clientes),
  canal de obtención, evidencia, fecha, quién lo registró, vencimiento y revocación.
- **No se puede crear un candidato sin consentimiento vigente** (alta atómica en la base de datos).
- Compartir un perfil con un cliente exige la finalidad "compartir con clientes".

**Trazabilidad**
- Bitácora existente (quién, qué, cuándo; sin valores personales).
- **Registro de accesos a datos sensibles**: los datos de `candidate_private` se leen mediante una función que
  registra quién los consultó y cuándo.
- Historial de etapas y de tareas.

**Derechos del titular (Ley 8968)**
- `data_subject_requests`: solicitudes de acceso, rectificación, supresión y oposición, con plazos y responsable.
- Revocación de consentimiento → bloquea nuevas postulaciones y marca el expediente.
- Preparación para **anonimización** y política de retención (plazo a definir con asesoría legal).

---

## 8. Fuentes de recepción (decisión 9)

- Catálogo `intake_channels`: WhatsApp, correo electrónico, redes sociales (LinkedIn, Facebook, Instagram, TikTok,
  otra), plataformas de empleo (configurable: p. ej. Computrabajo, Indeed, otras), ferias de empleo (nombre y fecha),
  formulario web, referencia (nombre de quien refiere), otro.
- Se registra en el **candidato** (primer contacto) y en **cada postulación** (canal por el que llegó a esa vacante),
  con detalle, fecha de recepción y `external_ref` para futuras integraciones.
- Indicadores por fuente en el dashboard.

---

## 9. Preparación para integraciones futuras (decisión 10)

Sin activar servicios nuevos; solo estructura:

| Capacidad futura | Preparación en fase 2 |
|---|---|
| Lector de CV / IA | Requisitos estructurados (§3), espacio para documentos y tabla de resultados de análisis prevista |
| Entrevistas dinámicas | Etapas configurables con tipo de etapa (`entrevista`, `prueba`) y tareas vinculadas |
| Informes ejecutivos | Historial de etapas, fuentes y tiempos → vistas SQL de métricas (`security_invoker`) |
| Exportaciones controladas | Exportación solo desde el servidor, por rol, **registrada en bitácora**; no se habilita en fase 2 |
| Comunicaciones automatizadas | Tabla `domain_events` (bandeja de salida) escrita por triggers, para procesarse luego con Cloudflare Cron (gratuito) |

Código organizado en capas: `src/modules/<módulo>/{schema,repository,service,actions}.ts`; la interfaz no accede
directamente a la base de datos.

---

## 10. Seguridad

- **RLS manda**: la interfaz oculta acciones, pero la base de datos bloquea cualquier intento directo por la API.
- Cada acción del servidor verifica sesión, rol y datos (Zod) y traduce errores sin exponer detalles técnicos.
- Reglas de negocio críticas (transiciones, consentimiento, duplicados, motivo de descarte) **en la base de datos**.
- Sin exportaciones masivas en fase 2. La clave secreta de Supabase nunca se usa en la aplicación.
- Modo demostración: solo lectura.

---

## 11. Planes gratuitos

| Servicio | Límite relevante | Medida |
|---|---|---|
| Cloudflare Workers | 10 ms CPU por solicitud, 100 000 solicitudes/día | Paginación en servidor, sin librerías pesadas |
| Supabase (×2 proyectos) | 500 MB por base de datos | Solo texto; archivos en fase 3 |
| Supabase | **Pausa tras 7 días sin actividad** | Reactivar desde el panel si ocurre |
| GitHub Actions | Minutos gratuitos | CI actual sin cambios de costo |

---

## 12. Entregas

| PR | Contenido | Migraciones (estimado) |
|---|---|---|
| **2A** | Base de formularios, paginación y filtros · Clientes · Gestión de usuarios · catálogo de fuentes · plantillas de proceso y requisitos por cliente · configuración de ambiente de pruebas en Cloudflare | `0800`–`0820` |
| **2B** | Requisiciones (aprobación, plantillas, responsables) · Vacantes (requisitos y etapas configurables, plantillas) · tareas y fechas límite | `0830`–`0850` |
| **2C** | Candidatos (datos sensibles separados, consentimiento, duplicados, fuentes) · Postulaciones (kanban, historial, notas, próximos pasos) · registro de accesos · derechos del titular · indicadores del dashboard | `0860`–`0899` |

**Procedimiento por PR**
1. PR con CI en verde (unitarias, RLS, E2E con Auth real, compilación Cloudflare).
2. Migraciones aplicadas y probadas primero en el **proyecto de pruebas** con datos ficticios.
3. Revisión y aprobación del usuario.
4. Migraciones aplicadas en producción (desde el navegador, con consulta de verificación).
5. Fusión a `main` → Cloudflare publica automáticamente.

Las migraciones son **aditivas y compatibles** con el código anterior. La de `candidate_private` mueve columnas;
en producción no hay candidatos, por lo que no afecta datos.

---

## 13. Pruebas (solo datos ficticios)

- Unitarias: validaciones, normalización de cédula/correo/teléfono, transiciones de estado.
- RLS: cada tabla nueva y cada regla por rol, incluido que `consulta` no pueda leer `candidate_private`.
- E2E con Supabase Auth real: flujos completos por rol.
- Ambiente de pruebas en la nube para validación manual por el usuario.

## 14. Fuera del alcance de la fase 2
Carga de CV y documentos, lector de CV, IA, entrevistas dinámicas, exportaciones, comunicaciones automatizadas,
portal público de vacantes e importación de datos reales.
