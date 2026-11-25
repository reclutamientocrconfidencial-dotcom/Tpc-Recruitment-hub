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
