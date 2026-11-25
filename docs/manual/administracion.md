# Manual de administración

## 1. Usuarios y roles
*Administración → Usuarios y roles.* Roles: **Administrador** (todo), **Coordinación** (gestión), **Reclutador(a)**
(solo lo asignado) y **Consulta** (solo lectura, sin datos sensibles). Todo usuario nuevo entra como Consulta.
Para dar de baja a alguien, **desactívelo** (nunca se borra, para conservar el historial).

## 2. Seguridad (puerta S1)
1. Active **su propia** verificación en dos pasos (*Mi seguridad*) y vuelva a ingresar con su código.
2. *Administración → Seguridad*: revise la tabla de usuarios. Pida a quienes figuran como **Pendiente** que la
   configuren.
3. Cuando todos estén en **Configurada**, pulse **Exigir a todos los usuarios**.
4. Quien no la tenga solo podrá configurarla; la base de datos no le mostrará información.
5. **Celular perdido:** en Supabase → *Authentication → Users* → usuario → eliminar su factor MFA. El usuario la
   configura de nuevo. Registre el hecho en la bitácora de incidentes.

## 3. Bitácora
*Administración → Bitácora.*
- **Cambios en los datos:** quién creó, modificó o eliminó cada registro y qué campos (sin valores personales).
- **Accesos, descargas y exportaciones:** consultas de datos sensibles, descargas, exportaciones e importaciones.
- Filtre por tabla o recurso, usuario y fechas. Los registros **no se pueden modificar ni borrar**.

## 4. Catálogos
*Administración → Catálogos.* Etapas, puestos, requisitos y escalas de dominio. Los elementos no se borran: se
desactivan. En **Requisitos** puede **Editar** nombre, categoría, escala y descripción; el cambio se aplica a todos
los requisitos configurados y queda en el historial. La escala no cambia si hay niveles mínimos configurados.

## 5. Respaldos y recuperación
Vea [`OPERACION.md` §8](../OPERACION.md): configuración inicial (clave GPG, credencial de respaldo, secretos de
GitHub), verificación mensual de que el respaldo diario termina en verde y prueba trimestral de restauración.

## 6. Cambios en la base de datos (migraciones)
Cada versión indica qué migración aplicar. Siempre: confirmar el **nombre del proyecto** en Supabase → ejecutar el
archivo **una sola vez** → ejecutar su **consulta de verificación** → comparar con lo esperado. Primero en TEST.

## 7. Consentimiento informado
*Administración → Consentimiento informado.* Cree una **versión nueva** con el texto aprobado por el asesor legal,
registre la **aprobación jurídica** (quién y cuándo) y pulse **Publicar como vigente**. Un texto que ya aceptaron
candidatos no se modifica: siempre se crea una versión nueva.

## 8. Importación masiva de candidatos (administración y coordinación)
1. *Candidatos → Importar* → descargue la **plantilla** (columnas en el orden de la ficha).
2. Complete el archivo (CSV o Excel). La **fuente** debe coincidir con un nombre del catálogo de fuentes.
3. Elija el archivo, indique **cómo otorgaron el consentimiento**, la **evidencia** y el **motivo**, y confirme la
   declaración. Pulse **Validar archivo**: todavía no se crea ningún candidato.
4. En el **informe** revise los conteos: válidas, posibles duplicados, duplicados por cédula y errores. Las filas con
   errores no se importan: corríjalas en el archivo y cárguelas en otro lote.
5. Para cada **posible duplicado** elija: *Crear nuevo*, *Completar el existente* (solo llena datos vacíos) u *Omitir*.
6. Pulse **Importar ahora**. Los datos del archivo se borran del lote y la importación queda registrada.
7. **Revertir** (solo administración): elimina los candidatos creados por el lote que aún no tengan postulaciones.
8. **Ensayo:** `node scripts/generar-candidatos-ficticios.mjs 2700 > ficticios.csv` genera 2.700 registros ficticios.
   **No importe datos reales** hasta completar la puerta S1 y la revisión jurídica.

## 9. Posibles duplicados
*Candidatos → Duplicados.* Para cada par: **Fusionar** (elija qué ficha conservar; se mueven postulaciones,
perfiles y consentimientos y se completan los datos vacíos) o **Son personas distintas** (no vuelve a aparecer).

## 10. Etapas de las vacantes
Las etapas de una vacante se **fijan** desde su proceso (vacante → cliente y puesto → cliente → puesto → estándar)
cuando recibe la primera postulación. Si después cambia el proceso, use **Actualizar etapas desde el proceso** en el
tablero: se agregan o actualizan etapas y las que ya tienen postulaciones nunca se eliminan (quedan inactivas).

## 11. Formularios públicos, enlaces y códigos QR (administración y coordinación)
*Recepción → Formularios, enlaces y QR.*
1. **Nuevo formulario:** elija la **vacante** (solo abiertas o pausadas sin formulario) o déjela vacía para un
   formulario permanente del **banco de talento** (la persona elige el puesto de interés). Escriba el título que verá
   el público, una presentación opcional, la fecha límite y si el currículum es obligatorio.
2. **Preguntas de preselección:** agregue las preguntas en orden. Tipos: *Sí/No*, *Selección de una opción*, *Número*
   y *Texto libre*. Opcionalmente defina el **criterio eliminatorio** («debe responder Sí», la opción que cumple o el
   número mínimo). El criterio **nunca se muestra al público** y no descarta automáticamente: solo marca «Cumple / No
   cumple» en la bandeja. Una pregunta que ya no aplique se **desactiva** (las respuestas anteriores se conservan).
3. **Enlaces y QR:** cree **un enlace por canal** (redes sociales, feria, volante, sucursal…) eligiendo el **canal de
   recepción** del catálogo y un detalle (p. ej. «Feria de empleo Heredia»). Cada enlace tiene su **código QR**:
   *Descargar QR* (SVG, ideal para imprimir en cualquier tamaño) o *Abrir* para ver el formulario como el público.
   Así sabrá por qué canal llegó cada candidato.
4. **Cerrar la recepción:** desactive el enlace (los demás siguen funcionando) o el formulario completo. El formulario
   también deja de recibir envíos cuando la vacante se cierra, se cubre o vence su fecha límite.
5. **Seguridad:** los envíos solo se aceptan desde la aplicación (clave de servidor), con límites anti-abuso y
   protección contra robots. Configuración técnica y rotación de la clave: `docs/OPERACION.md` §9.
6. **Antes de usar con personas reales:** completar la puerta S1 (verificación en dos pasos de todo el equipo,
   aprobación jurídica del consentimiento, habilitación de datos reales) y, recomendado, activar Cloudflare Turnstile.

## 12. Entrevistas y evaluaciones (administración y coordinación)
*Administración → Entrevistas y evaluaciones.*
- **Banco de preguntas:** pregunta, categoría, qué observar y alcance (todos los puestos o uno; todos los clientes o
  uno). Las preguntas que ya no se usan se **desactivan** (las entrevistas anteriores conservan su guion).
- **Tipos de evaluación:** nombre, escala de nivel (opcional), puntaje máximo y mínimo para aprobar (opcionales).
  Cargue en la descripción la referencia al instrumento oficial de TPC (prueba de Excel, prueba de inglés).
- **Tipos de credencial:** si tiene vencimiento y con cuántos días de anticipación se alerta.
- **Evaluaciones por vacante:** en la ficha de la vacante, *Evaluaciones de la vacante* → elija la prueba, la
  exigencia (obligatoria, deseable o no aplica) y el nivel mínimo cuando corresponda.
- **Plantilla del informe ejecutivo** (solo administración): escriba una sección por línea con el formato
  «Título | ayuda para quien redacta», el encabezado y el pie de confidencialidad, y pulse *Publicar nueva versión*.
  La anterior queda en el historial y los informes ya creados conservan su plantilla. **La plantilla actual es
  provisional:** reemplácela por el machote oficial de TPC cuando esté disponible.

## 13. Inteligencia artificial (solo administración)
*Administración → Inteligencia artificial.*
- **Activar / desactivar** el asistente. Con el proveedor **simulado** no se envía información a terceros: úselo en
  TEST para capacitar al equipo.
- **Proveedor externo (Anthropic):** solo con autorización de costos y acuerdo de tratamiento de datos. Requiere
  marcar la confirmación con su referencia, un **presupuesto mensual** mayor a cero, iniciar sesión con verificación
  en dos pasos y que el área técnica cargue el secreto `ANTHROPIC_API_KEY` en el servidor (`docs/OPERACION.md` §10).
- **Límites:** consultas por usuario por día y presupuesto mensual (al agotarse, la IA externa se bloquea hasta el mes
  siguiente).
- **Consumo del mes:** costo acumulado frente al presupuesto, consultas aceptadas, descartadas y con error, por
  función y por usuario.
