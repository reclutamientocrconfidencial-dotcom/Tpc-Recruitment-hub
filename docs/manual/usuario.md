# Manual de usuario

## 1. Ingresar al sistema
1. Abra la dirección del sistema en su navegador (computadora o celular).
2. Escriba su **correo** y **contraseña** y pulse **Iniciar sesión**.
3. Si tiene la verificación en dos pasos, abra la aplicación autenticadora del celular, escriba el **código de
   6 dígitos** y pulse **Verificar**.
4. Por seguridad, la sesión se cierra sola tras **30 minutos sin actividad**.

## 2. Verificación en dos pasos (obligatoria antes de trabajar con datos reales)
1. Instale en su celular una aplicación autenticadora gratuita (Google Authenticator o Microsoft Authenticator).
2. En el sistema, pulse el **escudo** (arriba a la derecha) → **Mi seguridad** → **Comenzar**.
3. Escanee el **código QR** con la aplicación (o escriba la clave que aparece debajo).
4. Escriba el código de 6 dígitos que muestra la aplicación y pulse **Activar**.
5. Desde ahora, cada vez que ingrese se le pedirá un código. **¿Perdió el celular?** Avise a un administrador.

## 3. Requisiciones (solicitudes de personal)
- **Crear** (coordinación): *Requisiciones → Nueva requisición* → elija cliente y puesto, plazas autorizadas,
  ubicación, horario, salario, responsable, prioridad y fecha límite → marque «Enviar a aprobación» si ya está lista.
- **Aprobar** (coordinación o administración): abra la requisición → **Aprobar**. Queda registrado quién y cuándo.
- **Seguimiento:** la ficha muestra plazas autorizadas, cubiertas, pendientes y disponibles. Las vacantes en
  borrador no cuentan.
- **Filtros:** estado, prioridad, cliente, responsable y «solo vencidas».

## 4. Vacantes
- **Crear:** desde la requisición aprobada → **Nueva vacante** (los datos se copian; puede ajustarlos).
- **Publicar:** *Publicar / abrir*. No se puede publicar si excede las plazas disponibles de la requisición.
- **Plazas cubiertas:** escriba el número y pulse **Actualizar**. Al completarse, la vacante pasa a «Cubierta».
- **Proceso y requisitos:** *Personalizar proceso* para etapas propias; *Cargar sugeridos* para los requisitos.
- **Duplicar:** crea una copia en borrador (misma u otra requisición), con su proceso y requisitos.
- **Reclutadores:** solo cambian el estado y las plazas cubiertas de sus vacantes asignadas.

## 5. Candidatos (base madre)
- **Buscar:** *Candidatos* → filtros por nombre, perfil, provincia, cantón, fuente, inglés, experiencia y estado.
  Para buscar por **cédula, correo o teléfono**, use el recuadro superior (la búsqueda queda registrada).
- **Registrar:** *Nuevo candidato* → complete la ficha en orden (1 nombre … 9 fuente). Agregue uno o varios
  **perfiles** del catálogo y marque el principal. Marque que la persona **aceptó el consentimiento**, cómo lo dio y
  la evidencia. Sin consentimiento no se puede registrar.
- **Posibles duplicados:** si el sistema encuentra a alguien con el mismo correo, teléfono o nombre, muestra la lista.
  Ábrala, compare y, si es otra persona, marque *«se trata de otra persona»* y guarde. Con la **misma cédula** no se
  permite: abra la ficha existente.
- **Ficha:** muestra los datos, consentimientos y el **historial de participación** en procesos. Los datos de contacto
  solo los ve el personal autorizado; cada consulta queda registrada.
- **Revocar el consentimiento:** en la ficha, escriba el motivo y pulse *Revocar*. La persona queda en «No
  contactar». Si vuelve a autorizar, use *Registrar consentimiento*.
- El rol **Consulta** ve la ficha general, pero nunca los datos de contacto ni la cédula.

## 6. Postulaciones y tablero Kanban
- **Abrir el tablero:** en la vacante, pulse **Tablero de postulaciones**. Cada columna es una etapa del proceso de la
  vacante; el número indica cuántas personas hay.
- **Agregar candidatos:** en el tablero, escriba el nombre en *Agregar candidato* → **Buscar** → **Agregar al proceso**.
  También desde la ficha del candidato: *Postular a una vacante*. Solo aparecen personas activas y con consentimiento.
- **Mover:** arrastre la tarjeta a otra columna o use **Mover a…** en la tarjeta (funciona con teclado y celular).
- **Descartar:** al mover a *Descartado* se pide el **motivo** (obligatorio) y un detalle opcional.
- **Contratar:** al mover a *Contratado* se ocupa una plaza de la vacante. Si ya no hay plazas, el sistema lo impide.
- **Alertas:** una tarjeta con borde amarillo superó el tiempo objetivo de la etapa.
- **Ficha de la postulación** (clic en el nombre): evalúe los **requisitos** (cumple, no cumple, nivel alcanzado),
  registre la **calificación** y el **próximo paso**, agregue **observaciones** (*equipo* o *confidencial*) y revise
  el **historial** de movimientos, que no se puede modificar.
- **Listado:** *Postulaciones* con filtros por candidato, tipo de etapa, responsable y «próximo paso vencido».
- El rol **Consulta** ve el tablero, pero no puede mover ni ver observaciones, historial ni evaluaciones.

## 7. Recepción de candidatos (formularios públicos)
Los candidatos pueden postularse solos desde un **enlace** o un **código QR**, sin cuenta en el sistema.

**Cómo llega una postulación**
1. La persona abre el enlace (por ejemplo, escaneando el QR de un volante), llena sus datos, responde las preguntas,
   adjunta su currículum (PDF o Word, máximo 5 MB) y **acepta el consentimiento informado**.
2. Si **no coincide** con nadie de la base madre, el sistema la **incorpora sola**: crea la ficha, registra el
   consentimiento con su evidencia, guarda el currículum y la agrega al tablero de la vacante en la primera etapa.
3. Si **coincide** por cédula, correo, teléfono o nombre con alguien existente, el envío queda **«Por revisar»** en
   la bandeja para que una persona decida (nunca se fusiona automáticamente).

**Bandeja de recepción** (*Recepción* en el menú; no disponible para el rol Consulta)
- Por omisión muestra lo **pendiente de revisión**. Filtre por estado o formulario.
- Columna **Preselección**: «Cumple» o «No cumple» según las preguntas eliminatorias. Es una ayuda para priorizar:
  **no descarta a nadie automáticamente**.
- Abra un envío para ver los datos, las respuestas, el canal (QR de feria, redes, etc.) y la coincidencia encontrada
  (con enlace a la ficha existente para comparar).
- **Decisión:**
  - *Es la misma persona* → se **vincula** a la ficha existente: agrega la postulación, el nuevo consentimiento y el
    currículum. Solo completa datos que estaban vacíos; **nunca sobrescribe** lo que ya existe.
  - *Es otra persona* → crea un candidato nuevo.
  - *Descartar* (envíos repetidos, de prueba o abusivos) → se eliminan sus datos personales y su currículum.
- Al resolver, los datos personales salen de la bandeja (quedan solo en la ficha del candidato).

**Currículums en la ficha del candidato**
- Sección **Currículums**: lista los recibidos por formulario y los cargados por el personal.
- **Descargar** genera un enlace temporal de un minuto; **cada descarga queda registrada**.
- **Cargar currículum**: solo PDF o Word (.docx) de hasta 5 MB. El sistema revisa el contenido real del archivo:
  un archivo renombrado (por ejemplo, un ejecutable con extensión .pdf) se rechaza.
- La **fuente de recepción** de la ficha y de la postulación indica el canal y el detalle del enlace usado.

> **En TEST:** mientras no se complete la puerta S1, los formularios solo aceptan **correos ficticios** terminados
> en `.test`. No comparta enlaces ni QR con personas reales.

## 8. Entrevistas, evaluaciones e informe ejecutivo
En la ficha de una postulación (clic en el nombre del candidato en el tablero):

**Entrevistas**
1. *Entrevistas → Programar*: fecha y hora (Costa Rica), modalidad, duración, entrevistador(a) y lugar o enlace.
2. El sistema arma el **guion** con las preguntas del banco: generales, del puesto de la vacante y del cliente.
3. Durante o después de la entrevista, escriba notas y una calificación (1 a 5) por pregunta.
4. Al terminar, cambie el estado a **Realizada**, elija la **recomendación** (obligatoria) y escriba el resumen.
   También puede marcar *Cancelada* o *No asistió*.

**Evaluaciones**
- La sección *Evaluaciones* muestra las pruebas que exige la vacante (obligatorias o deseables).
- Registre el estado (aprobada, reprobada, no se presentó), el puntaje y/o el nivel (por ejemplo, inglés B2) y una
  observación. El sistema no acepta un puntaje mayor al máximo ni un nivel de otra escala.
- El encabezado indica cuántas evaluaciones obligatorias están aprobadas.

**Informe ejecutivo**
1. *Crear informe ejecutivo*: se abre un borrador con la plantilla vigente. Las secciones de evaluaciones y de
   entrevista se **prellenan** con lo registrado; revíselas y complete las demás.
2. *Guardar borrador* tantas veces como necesite.
3. Elija la **recomendación final** y pulse *Finalizar informe*. Un informe final ya no se puede modificar.
4. Exporte a **Word** o **PDF**. Cada exportación queda registrada. El informe no incluye cédula ni datos de contacto.
5. Si hay que corregir un informe final, coordinación o administración lo **reabren**: se crea la versión siguiente.

## 9. Licencias, carnés y certificaciones
- En la ficha del candidato, sección *Licencias, carnés y certificaciones*: tipo, número, emisión, **vencimiento** y
  un respaldo opcional (PDF, Word, JPG o PNG de hasta 5 MB).
- Marque *Verifiqué el documento original* (o luego *Marcar verificada*): queda registrado quién y cuándo.
- La etiqueta indica **Vigente**, **Vence en N día(s)** (dentro del plazo de alerta del tipo) o **Vencida**.
- *Candidatos → Vencimientos* lista las credenciales vencidas o que vencen en los próximos 60 días.

## 10. Asistente de inteligencia artificial
Disponible solo si administración lo activó. Aparece como *Asistente de IA* en la postulación, la vacante y la ficha
del candidato. **Todo resultado es un borrador que usted debe revisar.**

| Dónde | Botón | Qué hace |
|---|---|---|
| Postulación | *Comparar con la vacante* | Puntaje de afinidad, fortalezas, brechas y qué verificar en la entrevista |
| Postulación (con informe en borrador) | *Redactar borrador del informe* | Propone el texto de cada sección |
| Vacante | *Sugerir preguntas de entrevista* | Preguntas con categoría y qué observar |
| Vacante | *Redactar publicación* | Texto para redes y portales (sin el nombre del cliente) |
| Ficha del candidato | *Extraer perfil del CV* | Resume puesto, experiencia, habilidades, idiomas y formación del texto pegado |

1. El sistema envía **solo los datos necesarios** y reemplaza nombre, correo, teléfono, identificación y enlaces por
   marcadores como «[CANDIDATO]».
2. El resultado aparece **«Pendiente de revisión»** con la etiqueta *Generado por IA*. Léalo y verifíquelo.
3. Pulse **Aceptar** si es correcto o **Descartar** si no (se elimina).
4. Solo un resultado aceptado puede aplicarse: *Completar secciones vacías del informe* (nunca reemplaza lo que usted
   escribió) o *Agregar al banco de preguntas* (coordinación y administración).
5. Hay un límite diario de consultas por usuario. Cada consulta queda registrada con su costo.
