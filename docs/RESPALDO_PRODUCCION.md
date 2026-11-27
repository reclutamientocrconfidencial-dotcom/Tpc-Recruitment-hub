# Respaldo cifrado de producción y verificación de su recuperación (Supabase Free)

**Para qué:** tener una copia cifrada y **comprobada** de la base de datos de producción **antes** de aplicar las
migraciones pendientes (0800 a 1800). **Costo:** cero. No requiere el plan Pro, ni Docker, ni instalar nada técnico
salvo el programa gratuito de cifrado. **Tiempo:** de 45 a 60 minutos la primera vez.

**Cómo funciona:**
1. GitHub Actions se conecta a producción con una credencial de **solo lectura** y exporta la base de datos.
2. **Antes de cifrar**, la restaura en una base temporal dentro de la misma ejecución y compara, tabla por tabla, que
   tenga los mismos registros que producción. También compara los usuarios y cuenta las políticas de seguridad.
3. Cifra el respaldo con la **clave pública** de TPC. Solo la **clave privada**, que nunca sale de TPC, puede abrirlo.
4. Lo guarda 14 días como archivo privado del repositorio, para que un custodio lo descargue y compruebe que puede
   descifrarlo.

Nada de este procedimiento modifica producción: solo crea una credencial de lectura y lee los datos.

---

## Parte 1. Crear la clave de cifrado de TPC (una sola vez, ±15 min)
Hágalo en la computadora de confianza de un custodio, **no** en un equipo compartido.

**Windows:**
1. Descargue e instale **Gpg4win**, que es gratuito: <https://www.gpg4win.org>. Se instala con el programa **Kleopatra**.
2. Abra **Kleopatra** → *Archivo → Nuevo par de claves OpenPGP…*
3. **Nombre:** `TPC Respaldos`. **Correo:** un correo institucional, por ejemplo el del área de TI.
4. *Configuración avanzada…* → **RSA 4096** · **Válida hasta:** dentro de 2 años → *Aceptar*.
5. *Proteger la clave con una frase de contraseña* → use una frase larga y guárdela en un gestor de contraseñas o en
   sobre cerrado. **Sin esta frase no se puede recuperar ningún respaldo.**
6. Al terminar: *Exportar…* → guarde **`TPC-respaldos-publica.asc`**. Esta es la clave **pública**: puede ir a GitHub.
7. Clic derecho en la clave → *Exportar claves secretas* (o *Copia de seguridad de claves secretas*) →
   **`TPC-respaldos-PRIVADA.asc`**.
8. Copie el archivo **PRIVADO** en **dos memorias USB cifradas**, en manos de **dos custodios** y en lugares
   distintos. Luego bórrelo del escritorio y vacíe la papelera. **Nunca** lo suba a GitHub, al correo, al chat ni a la
   nube.

**Mac:** instale **GPG Suite** (<https://gpgtools.org>, gratuito) y siga los mismos pasos en *GPG Keychain*.

---

## Parte 2. Credencial de solo lectura en Supabase de PRODUCCIÓN (±10 min)
1. Genere en su gestor de contraseñas una contraseña de **32 caracteres, solo letras y números**. Los símbolos como
   `@ : / #` rompen la cadena de conexión.
2. Entre a Supabase y **confirme que el nombre del proyecto, arriba a la izquierda, es el de PRODUCCIÓN.**
3. *SQL Editor* → *New query* → pegue y ejecute, con su contraseña entre las comillas:
   ```sql
   create role respaldo_lectura login password 'SU_CONTRASEÑA_GENERADA' bypassrls;
   grant pg_read_all_data to respaldo_lectura;
   ```
   - `bypassrls` es necesario porque **todas** las tablas tienen RLS forzado. Sin él, el respaldo falla con un error
     visible; nunca sale incompleto en silencio.
   - Esta credencial **solo puede leer**: no puede modificar ni borrar nada.
4. **Si Supabase rechaza `bypassrls`** con un error de permisos, use temporalmente el usuario `postgres`. En la
   Parte 3, use ese usuario y su contraseña, que puede restablecer en *Project Settings → Database → Reset database
   password*. La aplicación **no** usa esa contraseña, así que cambiarla no la afecta. Después de aplicar las
   migraciones, restablezca de nuevo esa contraseña. Anote la excepción en la bitácora.

---

## Parte 3. Cadena de conexión (±5 min)
1. En el proyecto de PRODUCCIÓN pulse **Connect** (arriba) → pestaña **Connection string** → tipo **URI** →
   **Session pooler**.
   - Use el *pooler*, no la conexión directa: GitHub no tiene IPv6 y la conexión directa de Supabase Free es solo IPv6.
2. Verá algo como:
   `postgresql://postgres.abcdefghijkl:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
3. Cambie **`postgres.`** por **`respaldo_lectura.`**. Conserve el código del proyecto que va después del punto.
4. Cambie `[YOUR-PASSWORD]` por la contraseña de la Parte 2. Los corchetes también se quitan. Ejemplo final:
   `postgresql://respaldo_lectura.abcdefghijkl:Ab12Cd34…@aws-0-us-east-1.pooler.supabase.com:5432/postgres`

---

## Parte 4. Guardar los secretos en GitHub (±5 min)
Repositorio → **Settings → Secrets and variables → Actions → New repository secret**:

| Nombre | Valor |
|---|---|
| `RESPALDO_DB_URL` | La cadena de la Parte 3 |
| `RESPALDO_GPG_PUBLIC_KEY` | Abra `TPC-respaldos-publica.asc` con el Bloc de notas y copie **todo**, incluidas las líneas `-----BEGIN PGP PUBLIC KEY BLOCK-----` y `-----END…-----` |

GitHub oculta los secretos en los registros (aparecen como `***`) y nadie puede volver a leerlos, ni siquiera usted.

---

## Parte 5. Generar el respaldo y verificar su recuperación (±10 min)
Mientras los PR no estén fusionados en `main`, GitHub no muestra el botón *Run workflow*. Por eso, el respaldo manual
se activa creando la rama `respaldo-produccion`:

1. En GitHub, pestaña **Code** → selector de ramas (dice `main`) → escriba **`claude/fase-8-operacion`** y elíjala.
2. Abra de nuevo el selector → escriba **`respaldo-produccion`** → pulse **Create branch respaldo-produccion from
   claude/fase-8-operacion**.
   - Si lo prefiere, pídame que la cree por usted.
3. Vaya a **Actions → Respaldo cifrado**. Aparecerá una ejecución en curso; tarda unos 5 minutos.
4. Al terminar en **verde** ✅, abra la ejecución → *respaldo* → paso **«Respaldo cifrado (con verificación de
   recuperación)»**. Debe leer:
   - `✓ Recuperación verificada: N tablas con los mismos registros, 1 usuario(s) y M políticas RLS.`
   - En producción hoy esperamos **1 usuario**, porque tiene un usuario y cero clientes.
5. Al final de la página, en **Artifacts**, descargue **`respaldo-<número>`**. Es un `.zip` que contiene el archivo
   cifrado `.dump.gpg` y su suma de verificación `.sha256`. **Guarde una copia fuera de GitHub**, por ejemplo junto a
   la memoria USB del custodio, porque GitHub la borra a los 14 días.
6. **Para repetirlo** (por ejemplo, el mismo día en que se apliquen las migraciones): abra la última ejecución →
   **Re-run all jobs**.

Si termina en **rojo** ❌, el archivo cifrado igual se guarda, pero **no** aplique migraciones. Vea la Parte 8.

---

## Parte 6. Comprobar que TPC puede abrir el respaldo (custodio, ±5 min)
Esto demuestra que la clave privada y su frase funcionan. Sin eso, un respaldo no sirve.

1. Descomprima el `.zip`.
2. **Huella de integridad:** en PowerShell, dentro de la carpeta:
   `Get-FileHash .\tpc-respaldo-*.dump.gpg -Algorithm SHA256`
   El resultado debe coincidir con el texto del archivo `.sha256`. Las mayúsculas y minúsculas no importan. En Mac:
   `shasum -a 256 tpc-respaldo-*.dump.gpg`.
3. En **Kleopatra** → *Archivo → Descifrar/verificar…* → elija el `.dump.gpg` → escriba la frase. Si lo descifra
   (crea un `.dump`), la prueba es **exitosa**.
4. El `.dump` descifrado contiene datos de producción: **bórrelo** de inmediato y vacíe la papelera. El archivo
   cifrado sí puede conservarse.

---

## Parte 7. Registrar y seguir
Anote en la bitácora de operación:
- fecha;
- número de la ejecución de GitHub;
- línea «Recuperación verificada» (tablas, usuarios y políticas);
- quién descifró y la huella SHA256.

Con eso, el respaldo previo está **listo** y se puede pasar a la *Fase B* de
[DESPLIEGUE_PRODUCCION.md](DESPLIEGUE_PRODUCCION.md), siempre con autorización. Repita la Parte 5 (paso 6) **el mismo
día** de las migraciones, justo antes de empezar.

---

## Parte 8. Si algo falla
| Mensaje en el registro | Causa probable | Solución |
|---|---|---|
| `Respaldo no configurado (faltan secretos)` | Falta un secreto o el nombre está mal escrito | Revise la Parte 4 (nombres exactos) |
| `password authentication failed` | Usuario o contraseña incorrectos | Revise que el usuario sea `respaldo_lectura.<código>` y la contraseña (Parte 3) |
| `Network is unreachable` / `could not translate host name` | Se usó la conexión directa | Use **Session pooler** (Parte 3) |
| `query would be affected by row-level security policy` | La credencial no tiene `bypassrls` | Parte 2, paso 4 |
| `La recuperación NO coincide con el origen` | Hubo cambios durante el respaldo o una diferencia de restauración | Repita la ejecución; si persiste, envíeme el registro (los secretos aparecen ocultos) |
| Kleopatra no descifra | Clave o frase equivocada | Use la clave del custodio correcto; si la frase se perdió, cree una clave nueva (Parte 1) y reemplace el secreto |

**Recuperación ante un desastre (sin plan Pro):** se crea un proyecto Supabase nuevo, se aplican las migraciones
del repositorio y se restauran los datos del respaldo con apoyo técnico ([OPERACION.md](OPERACION.md) §8.2). Para
una migración fallida, primero se usa su **reversión documentada** (§5), que no requiere restaurar.

**Después del despliegue:** cuando los flujos estén en `main`, el respaldo corre **solo cada día a la 01:17** (hora
de Costa Rica) y también se puede lanzar con *Run workflow*. Revíselo semanalmente (OPERACION §13).
