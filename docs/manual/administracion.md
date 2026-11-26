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
