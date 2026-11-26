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
3. Mientras la entrevista está **programada**, en *Preparar el guion* puede **agregar**, **editar** (lápiz) o
   **quitar** preguntas, e indicar la **competencia evaluada** y el **objetivo** de cada una. Si la IA está activa,
   *Proponer preguntas personalizadas* sugiere preguntas basadas en el CV, las funciones y requisitos de la vacante y
   los pendientes de la preselección: marque las que quiera y pulse *Agregar las marcadas al guion*.
4. El sistema **no permite** preguntas sobre edad, estado civil, hijos, embarazo, religión, salud, orientación
   sexual, origen, afiliación política o sindical ni apariencia física (tampoco escritas a mano). Las repetidas se
   omiten.
5. Durante o después de la entrevista, escriba notas y una calificación (1 a 5) por pregunta y pulse *Guardar
   entrevista*.
6. *Organizar respuestas y conclusiones* (IA) propone un resumen, evidencias, fortalezas y aspectos por validar
   **solo con lo que usted anotó**. *Usar como resumen de la entrevista* lo copia únicamente si el resumen está vacío;
   revíselo y ajústelo.
7. Al terminar, cambie el estado a **Realizada**, elija la **recomendación** (obligatoria) y guarde. También puede
   marcar *Cancelada* o *No asistió*.

**Evaluaciones**
- La sección *Evaluaciones* muestra las pruebas de la vacante: **obligatorias** u **opcionales**. Las marcadas como
  *No aplica* no aparecen ni afectan el resultado.
- Registre el estado (aprobada, reprobada, no se presentó), el puntaje y/o el nivel (por ejemplo, inglés B2) y una
  observación. Si la vacante tiene **criterios aprobados** (por ejemplo, en un caso práctico: análisis, propuesta,
  presentación), califique cada criterio de 1 a 5.
- El sistema calcula un **puntaje de 0 a 100** por evaluación y el **resultado ponderado** de la postulación según el
  peso de cada evaluación. El encabezado indica las obligatorias aprobadas y las pendientes.

**Informe ejecutivo**
1. *Crear informe ejecutivo*: se abre un borrador con la plantilla vigente (13 apartados). Las evidencias de la
   entrevista se **prellenan** con los resúmenes registrados; si aceptó una preselección, también las fortalezas y
   los aspectos por validar. Revise y complete los textos: resumen ejecutivo, casos prácticos, disponibilidad y
   condiciones, y conclusión.
2. Al exportar, el documento agrega **automáticamente** y solo con información validada: información general,
   formación y trayectoria (del **perfil curricular confirmado**), matriz de cumplimiento (requisitos verificados),
   evaluación de competencias (calificaciones de la entrevista), resultados de pruebas y casos prácticos. **Los
   apartados sin información se omiten.**
3. *Guardar borrador* tantas veces como necesite. Elija la **recomendación final** y pulse *Finalizar informe*. Un
   informe final ya no se puede modificar.
4. Exporte a **Word** o **PDF** con el diseño corporativo (encabezado TPC, tarjetas de resultados, barras de
   competencias, matriz, numeración de páginas y aviso de confidencialidad). Cada exportación queda registrada. El
   informe no incluye cédula ni datos de contacto.
5. Si hay que corregir un informe final, coordinación o administración lo **reabren**: se crea la versión siguiente.

**Informe comparativo de terna**
- En la ficha de la vacante, *Informe comparativo de terna*: marque de 2 a 6 candidatos con informe **final** y
  pulse *PDF* o *Word*. Compara puesto actual, experiencia, requisitos obligatorios, resultado ponderado,
  recomendación, matriz de cumplimiento, fortalezas y aspectos por validar. La exportación queda registrada.

## 9. Licencias, carnés y certificaciones
- En la ficha del candidato, sección *Licencias, carnés y certificaciones*: tipo, número, emisión, **vencimiento** y
  un respaldo opcional (PDF, Word, JPG o PNG de hasta 5 MB).
- Marque *Verifiqué el documento original* (o luego *Marcar verificada*): queda registrado quién y cuándo.
- La etiqueta indica **Vigente**, **Vence en N día(s)** (dentro del plazo de alerta del tipo) o **Vencida**.
- *Candidatos → Vencimientos* lista las credenciales vencidas o que vencen en los próximos 60 días.

## 10. Asistente de inteligencia artificial
Disponible solo si administración lo activó. **Todo resultado es un borrador que usted debe revisar. La IA nunca
descarta ni avanza candidatos: esa decisión es siempre suya.**

| Dónde | Botón | Qué hace |
|---|---|---|
| Ficha del candidato → *Perfil curricular* | *Leer currículum* | Extrae formación, trayectoria, funciones, logros, habilidades, idiomas, certificaciones y licencias |
| Postulación | *Analizar CV frente a la vacante (matriz)* | Matriz de cumplimiento por requisito con evidencias y pendientes |
| Vacante → *Preselección* | *Analizar postulaciones activas* | Análisis por lotes y comparación de candidatos |
| Entrevista | *Proponer preguntas personalizadas* · *Organizar respuestas y conclusiones* | Guion basado en el CV y conclusiones a partir de sus notas |
| Postulación | *Comparar con la vacante* | Fortalezas, brechas y qué verificar en la entrevista |
| Postulación (con informe en borrador) | *Redactar borrador del informe* | Propone textos solo con información validada |
| Vacante | *Sugerir preguntas de entrevista* · *Redactar publicación* | Preguntas para el banco y texto de la publicación |

**Lectura del currículum**
1. En la ficha del candidato, *Perfil curricular*: elija un **archivo guardado** (PDF o Word) o **pegue el texto**
   y pulse *Leer currículum*. Un PDF se lee en su navegador; la descarga queda registrada.
2. Se abre la **revisión**: compare cada dato con el currículum original y corrija, agregue o quite puestos,
   formación e idiomas. *Guardar borrador* conserva los cambios.
3. *Confirmar e incorporar a la ficha*: el perfil queda como versión oficial (no se puede modificar; para cambiarlo,
   haga una nueva lectura). Si lo marca, se actualizan en la ficha el puesto actual, los años de experiencia y el
   nivel de inglés (nunca datos de contacto).
4. Si el documento está **escaneado** o dañado, aparece «No legible: completar a mano» y no se envía a la IA:
   complete el perfil manualmente a partir del archivo. «Lectura parcial» indica que debe revisar con especial cuidado.

**Preselección**
- La matriz indica para cada requisito: **Cumplimiento confirmado**, **Cumplimiento parcial**, **Incumplimiento
  documentado** (solo con evidencia) o **Información insuficiente**, con la evidencia y lo que falta verificar.
- *Aceptar* y luego *Registrar en los requisitos pendientes* marca «Cumple» o «No cumple» solo en los requisitos que
  seguían pendientes (con la evidencia como nota). Lo parcial o sin información queda pendiente para la entrevista.
- **Por lotes** (*Vacante → Preselección*): analiza las postulaciones activas con perfil curricular, muestra el
  avance y puede detenerse. Si la información de un candidato no cambió, **reutiliza** el análisis anterior sin
  costo. Con un proveedor externo, el lote se detiene al llegar al **tope de costo** indicado.
- La tabla compara a los candidatos por requisito. El orden es informativo (requisitos obligatorios confirmados).

**Reglas generales**
1. El sistema envía **solo los datos necesarios** y reemplaza nombre, correo, teléfono, identificación y enlaces por
   marcadores como «[CANDIDATO]».
2. El resultado aparece **«Pendiente de revisión»** con la etiqueta *Generado por IA*. Léalo y verifíquelo.
3. Pulse **Aceptar** si es correcto o **Descartar** si no (se elimina).
4. Solo un resultado aceptado puede aplicarse, y nunca reemplaza lo que usted escribió.
5. Hay un límite diario de consultas por usuario. Cada consulta queda registrada con su costo.

## 11. Mi jornada (personal operativo)
*Mi jornada* en el menú reúne lo que requiere su atención hoy:
- **Resumen:** atrasados, entrevistas en 7 días, tareas, evaluaciones pendientes y envíos por revisar.
- **Entrevistas próximas** (usted entrevista) y **entrevistas sin resultado** (ya pasaron y siguen «programadas»).
- **Próximos pasos vencidos o de hoy** y **etapas con tiempo excedido** de sus postulaciones.
- **Evaluaciones obligatorias pendientes** e **informes ejecutivos pendientes**.
- **Credenciales por vencer** en 30 días.

**Tareas y recordatorios:** escriba la tarea, el tipo (por ejemplo *Seguimiento a cliente* para clientes que no han
respondido), la fecha y el cliente si aplica. Márquela *Hecha* o *Cancelar*. Coordinación puede asignar tareas a otras
personas y ve las **tareas vencidas del equipo**.

**Calendario:** *Generar enlace de calendario* → copie el enlace y agréguelo en Google Calendar («Otros calendarios →
Desde URL») u Outlook («Agregar calendario → Desde Internet»). Verá sus entrevistas y tareas **sin nombres de
candidatos**. En cada entrevista programada también puede usar *Agregar a mi calendario* (.ics). Si comparte el enlace
por error, use *Renovar enlace*.

**Productividad:** botón *Productividad* → postulaciones creadas, movimientos de etapa, entrevistas, informes,
contrataciones, días promedio a contratación y tareas, por período (máximo un año). Cada reclutador ve sus propios
indicadores; coordinación y administración ven al equipo.

## 12. Indicadores gerenciales
*Indicadores* en el menú. Filtre por **período** (máximo dos años) y **cliente**.
- **Resumen ejecutivo:** requisiciones y vacantes abiertas, cobertura de plazas, postulaciones en proceso,
  postulaciones y contrataciones del período, días promedio a contratación y conversión.
- **Embudo y motivos de descarte**, **tiempos por etapa** (promedio, mediana y objetivo), **fuentes más efectivas**,
  **desempeño por reclutador** y **por cliente**. Cada barra muestra también su valor en número.
- Administración, coordinación y consulta ven los totales de la empresa; cada reclutador ve sus propios procesos.
- Los indicadores son agregados: no muestran datos personales.

**Exportar (administración y coordinación):** al final de la página elija el conjunto de datos y el formato (Excel o
CSV), escriba el **motivo** y pulse *Exportar*. Se exporta el período y el cliente filtrados. Límite: 5.000 filas y
20 exportaciones por día. Nunca se exportan cédula ni datos de contacto, y cada exportación queda registrada.
