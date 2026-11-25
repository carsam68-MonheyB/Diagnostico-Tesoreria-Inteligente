# Diagnóstico de Tesorería Inteligente

Formulario web por pasos para levantar la información de la tesorería de un grupo de empresas (bancos, cuentas, host to host, créditos, coberturas, intercompañías, pagos, sistemas e infraestructura) y medir la complejidad del proyecto de tablero de control. Se publica en Netlify y las respuestas llegan por **Netlify Forms**.

> **El aviso de privacidad debe ser revisado por un abogado antes de publicarse.**

## Estructura

```
/index.html                     Formulario por pasos (pasos 0 a 14)
/aviso-de-privacidad.html       Aviso de privacidad integral + cláusula de confidencialidad
/gracias.html                   Página posterior al envío
/diagnostico.html               Página INTERNA de complejidad (no ligada, noindex)
/404.html                       Página no encontrada
/assets/css/styles.css          Estilos (colores en variables :root)
/assets/js/catalogos.js         Catálogos de opciones (compartido)
/assets/js/form.js              Lógica del formulario, borrador, validación y envío
/assets/js/diagnostico.js       Cálculo de conteos, matriz y recomendación
/assets/plantillas/plantilla_cuentas.xlsx / .csv   Plantilla de cuentas
/config/complejidad.json        Estructura de la matriz (valores PENDIENTES)
/tools/generar_plantilla.py     Regenera las plantillas (no se publica)
/netlify.toml                   Publicación, encabezados de seguridad y bloqueos
/robots.txt
```

Sin frameworks ni dependencias externas: HTML, CSS y JavaScript. No hay paso de compilación.

## Cómo funciona el envío

- La copia estática oculta del formulario `diagnostico-tesoreria` (al final de `index.html`) es la que Netlify detecta al hacer el deploy. Incluye el honeypot `bot-field`.
- El formulario visible (`#wizard`) arma el envío con JavaScript:
  - **Campos planos** para leer rápido en el panel: grupo, contacto, número de empresas, cuentas, bancos, créditos y coberturas, H2H, alojamiento, versión del aviso, fecha y hora de aceptación, y negativa a finalidades secundarias.
  - **`payload_json`**: todas las respuestas con su estructura (listas de empresas, cuentas, créditos y coberturas).
- Sin archivos, el envío va URL‑encoded. Con archivos, va como `FormData` sin fijar el `Content-Type`.
- Netlify limita cada envío a 8 MB y un archivo por campo. El navegador valida el tamaño y los tipos permitidos (`.txt, .csv, .xlsx, .xls, .xml, .pdf, .zip`) antes de enviar.
- El borrador se guarda en `localStorage` del navegador del cliente (envuelto en try/catch) y se borra al enviar. Los archivos adjuntos no se guardan en el borrador.
- **Si agrega un campo plano al envío, agréguelo también en la copia oculta**; de lo contrario Netlify lo descarta.

## Correrlo localmente

Necesita un servidor local porque `diagnostico.html` lee `config/complejidad.json`. Desde la carpeta del repositorio, ejecute:

```bash
python3 -m http.server 8080
```

Después abra `http://localhost:8080` en el navegador.

El envío **solo funciona ya publicado en Netlify**; en local el botón “Enviar” muestra un error y conserva el borrador. Para probar el envío real use un *Deploy Preview* o el sitio publicado.

Para regenerar las plantillas después de cambiar catálogos (requiere `pip install openpyxl`):

```bash
python3 tools/generar_plantilla.py
```

## Publicar en Netlify

### 1. Conectar el repositorio de GitHub y publicar

1. Entre a <https://app.netlify.com> e inicie sesión.
2. En el panel de su equipo, haga clic en **Add new project** y luego en **Import a Git repository**. En algunas versiones del panel dice *Add new site → Import an existing project*.
3. Elija **GitHub** y autorice a Netlify cuando se lo pida. Si el repositorio no aparece, use **Configure the Netlify app on GitHub**, dé acceso al repositorio `Diagnostico-Tesoreria-Inteligente` y regrese.
4. Seleccione el repositorio **Diagnostico-Tesoreria-Inteligente**.
5. En la configuración de publicación:
   - **Branch to deploy**: `main`. Primero fusione la rama de este trabajo con `main`.
   - **Base directory**: vacío.
   - **Build command**: vacío.
   - **Publish directory**: `.` (punto). Si lo deja vacío, `netlify.toml` ya lo indica.
6. Haga clic en **Publish** (en algunas versiones dice **Deploy**). Espere a que el deploy diga **Published**.
7. Opcional, para cambiar la dirección `xxxx.netlify.app`: en el menú lateral entre a **Project configuration → General → Project details** y haga clic en **Change project name**. En el panel anterior la ruta es *Site configuration → Site details → Change site name*.

### 2. Activar la detección de formularios

1. En el menú lateral del proyecto haga clic en **Forms**.
2. Haga clic en **Enable form detection**.
3. Netlify detecta formularios a partir del siguiente deploy. Vaya a **Deploys** en el menú lateral, abra el menú **Trigger deploy** y elija **Deploy project** (o *Deploy site*).
4. Cuando termine, regrese a **Forms**. En **Active forms** debe aparecer **diagnostico-tesoreria**.

### 3. Recibir un correo por cada envío nuevo

1. En el menú lateral haga clic en **Forms** y después en la pestaña **Submission notifications**.
2. Haga clic en **Add notification** y elija **Email notification**.
3. En **Event to listen for** elija **New form submission**.
4. En **Email to notify** escriba el correo `[[PENDIENTE: correo de notificaciones]]`.
5. En **Form** elija **diagnostico-tesoreria** (no deje *Any form*).
6. Haga clic en **Save**.
7. Si el correo no pertenece a un miembro de su equipo en Netlify, llegará un correo de confirmación: ábralo y haga clic en **Confirm**. Hasta entonces la notificación aparece como *pending confirmation*.

El asunto del correo es “Nuevo diagnóstico de tesorería: {grupo}”, porque el formulario envía el campo `subject`.

### 4. Descargar las respuestas (CSV)

1. En el menú lateral haga clic en **Forms**.
2. En **Active forms** haga clic en **diagnostico-tesoreria**.
3. Haga clic en **Download as CSV**, en la parte superior de la lista de envíos. Solo exporta los envíos verificados; los marcados como spam se revisan cambiando la vista de la lista a *Spam submissions*.
4. Los archivos adjuntos aparecen como enlaces dentro de cada envío.
5. Para borrar envíos (por ejemplo, al vencer el plazo de conservación del aviso): marque la casilla de cada envío y haga clic en **Delete submission**. Es permanente.

Revise el consumo de envíos en **Forms → Usage**, según su plan de Netlify.

## Diagnóstico de complejidad (uso interno)

1. Abra `https://SU-SITIO.netlify.app/diagnostico.html`. No está ligada desde el formulario y tiene `noindex`, pero **no tiene contraseña**: cualquiera con la dirección puede abrirla. No expone respuestas, porque solo procesa en su navegador el archivo que usted carga.
2. Cargue el CSV descargado de Netlify o el JSON que el cliente descarga en el paso 14. Si el CSV trae varias respuestas, elija una en la lista.
3. La página muestra:
   - los conteos;
   - la matriz por dimensión (bancos/formatos, volumen, créditos y coberturas, intercompañías, sistemas/ERP e infraestructura);
   - la recomendación preliminar (Power BI o tablero interno; servidor propio o nube);
   - la deuda por moneda con su costo promedio ponderado en tasa nominal anual;
   - el detalle cualitativo.
4. Mientras `config/complejidad.json` tenga valores `null`, la página muestra los valores, pero niveles y recomendación quedan **pendientes** y se listan los datos que faltan.
5. Para probar valores sin publicarlos, use **“Usar otra configuración de la matriz”** y cargue un `complejidad.json` desde su equipo. Solo aplica en esa pestaña.

### Cómo se calcula (estructura propuesta; los valores los define usted)

- **Niveles**: `escala.niveles` (propuesta: Baja / Media / Alta).
- **Métrica numérica**: `umbrales` ascendentes. Nivel = 1 + número de umbrales que el valor supera.
- **Métrica sí/no**: `nivel_si` y `nivel_no`.
- **Dimensión**: promedio o máximo de sus métricas (`agregacion_metricas`). Las métricas sin dato del cliente no cuentan.
- **Puntaje total**: promedio ponderado de las dimensiones por `peso`; `clasificacion_total.umbrales` le asigna un nivel global.
- **Recomendación**: cada señal activa suma su `peso` a la opción que `favorece`. El puntaje total suma su peso según el `corte`. Gana la opción con más peso; en empate se muestra el texto de `empate`.

Las instrucciones también están dentro de `config/complejidad.json`.

## Seguridad

- El formulario **no** pide números de cuenta o CLABE completos (solo los últimos 4 dígitos, validados), contraseñas, tokens, llaves, certificados ni credenciales del H2H. Si la plantilla de cuentas trae números completos, solo se conservan los últimos 4 dígitos. La plantilla se lee en el navegador y no se envía.
- Los archivos de muestra deben ser layouts o ejemplos anonimizados; la advertencia aparece junto a cada campo de carga.
- `netlify.toml` aplica una política de seguridad de contenido (CSP) estricta: sin scripts de terceros.
- También bloquea el acceso público a `README.md`, `netlify.toml` y `tools/`.
- Las respuestas quedan en Netlify, cuyos servidores están fuera de México; el aviso de privacidad lo declara.

## Pendientes `[[PENDIENTE]]`

Marcados en amarillo en el sitio. Búsquelos con `grep -rn "PENDIENTE" .`.

**Marca y diseño**
1. Nombre o marca con la que se publica: encabezado y pie de `index.html`, `aviso-de-privacidad.html` y `gracias.html`.
2. Logotipo (SVG o PNG): sustituir el texto de `.marca`; hay un comentario en `index.html`.
3. Colores de marca: variables `:root` de `assets/css/styles.css`.

**Aviso de privacidad (`aviso-de-privacidad.html` y avisos simplificados en `index.html`)**
4. Nombre o razón social del responsable, y si es persona física o moral.
5. Domicilio completo del responsable.
6. Correo para derechos ARCO y revocación del consentimiento.
7. Plazo de conservación de los datos.
8. Finalidades secundarias: definirlas, o eliminarlas junto con la casilla de negativa en el paso 14.
9. Proveedor de correo donde se reciben las notificaciones.
10. Fecha de publicación del aviso. Al publicarlo, actualice la versión en `aviso-de-privacidad.html` y en `AVISO_VERSION` de `assets/js/form.js`.
11. Revisión del abogado:
    - plazos de respuesta ARCO;
    - remisión internacional a Netlify;
    - qué hacer si llega un archivo con datos de terceros.
12. Quiénes tendrán acceso a la información, para la cláusula de confidencialidad.

**Contenido del formulario**
13. Tiempo estimado de llenado (paso 0).
14. Plazo de entrega y formato del diagnóstico para el cliente (paso 0).
15. Plazo de respuesta y correo de contacto (`gracias.html`).

**Netlify**
16. Correo que recibirá las notificaciones de cada envío.

**Matriz de complejidad (`config/complejidad.json`)**
17. Número y nombres de niveles (propuesta: Baja / Media / Alta).
18. Forma de combinar las métricas de cada dimensión: promedio o máximo.
19. Peso de cada una de las 6 dimensiones.
20. Umbrales de cada métrica numérica, y nivel sí/no de cada métrica binaria.
21. Umbrales de la clasificación total.
22. Recomendación de herramienta:
    - corte de puntaje y a qué opción favorece por encima y por debajo;
    - peso de cada señal;
    - qué favorecen `usa_m365`, `actualizacion_intradia` y `usuarios_mayor_a` (y el número de usuarios de corte);
    - texto en caso de empate.
23. Recomendación de alojamiento: lo mismo que el punto anterior, incluido a qué favorece `tiene_gateway`.
