# Kaótico · Pelos y Trufas

Landing para una peluquería canina. El gancho es un cachorro que **sigue el cursor con
la mirada** en ocho direcciones, con poses reales de video en lugar de una animación
falsa.

Sitio estático, sin build. Para verlo:

```bash
python -m http.server 5173
```

y abrir `http://localhost:5173/site/index.html`.

Las notas técnicas y las mediciones están en [ESTADO.md](ESTADO.md).

---

## Cómo funciona el efecto

Un atlas de **167 poses** (una celda central y ocho radios) indexado por el **ángulo**
del cursor. Cambiar de pose cuesta un `background-position`.

En móvil no hay cursor, pero sí inclinación: el mismo módulo se alimenta del
**giroscopio**. Como separa *hacia dónde mirar* de *cómo pintar*, cambiar la fuente
de entrada no toca ni el atlas ni la selección por ángulo.

No es scrubbing de video, y eso es deliberado: `currentTime` es un solo número y no
puede representar una dirección en dos ejes; además cada salto en un `<video>` cuesta
milisegundos, que es lo que se percibe como entrecortado.

---

## Roadmap

### Hecho
- [x] Efecto de mirada: 8 radios, 167 poses, elegidas por ángulo
- [x] Hero a pantalla completa con navegación superpuesta
- [x] Secciones "Quién soy" y "Servicios"
- [x] Burbuja de WhatsApp fija, sin número mientras el proyecto no esté acordado
- [x] Logo de marca en la navegación
- [x] Sección de asesorías
- [x] Productos en carrusel, con reflejo al pasar por encima
- [x] Agenda con calendario y giro de hoja al cambiar de mes
- [x] Contacto con ubicación y horarios
- [x] Asesorías en la navegación
- [x] Publicado en Vercel, con despliegue automático en cada push
- [x] **Seguimiento por giroscopio en móvil**: sin cursor, el perro sigue la
      inclinación del teléfono
- [x] Favicon con la cara del cachorro
- [x] Menú desplegable en móvil
- [x] Hero móvil con la misma composición que escritorio, recortado a 16:9

### En curso
- [ ] **Seguir puliendo los textos con la voz del dueño**, sección por sección
- [ ] Fotos reales del dueño y de antes/después
- [ ] Nivel intermedio de atlas para móvil: hoy o pesa 607 KB y se ve blando,
      o pesa 3.5 MB. Falta el punto medio

### Pendiente de decisión
- [ ] Enlace de WhatsApp al número real (hoy apunta a `wa.me/` sin destinatario)
- [ ] Publicar el repositorio, cuando el dueño esté de acuerdo
- [ ] Igualar amplitudes de los radios SE y SW, que giran más que sus vecinos:
      gana uniformidad y pierde expresividad, sin decidir

---

## Fallos detectados y cómo se resolvieron

Este registro existe porque casi todos se detectaron **mirando**, no leyendo el código.

### El perro no seguía al cursor
Cinco versiones de cuatro IA distintas fallaron igual. La causa no era calibración:
fundir dos videos por opacidad no genera la pose intermedia, genera dos perros
translúcidos superpuestos. Y una línea de tiempo no puede representar dos ejes.
**Resuelto** cambiando de video a atlas de poses indexado por ángulo.

### Recorría las cuatro direcciones sin importar dónde estuviera el cursor
Resultó ser el comportamiento real de la técnica del tutorial en el que se basó
el proyecto: un scrubber de un solo eje sobre un clip que mira a los cuatro lados.
No era un error de implementación.

### El modo espejo mataba el efecto
Voltear la imagen para simular el lado que faltaba se notaba. **Resuelto** generando
un clip propio para cada dirección: hoy no hay un solo píxel espejado.

### Costura vertical en el fondo del hero
La celda del atlas y el fondo son codificaciones distintas de los mismos píxeles y su
unión dejaba un borde visible (5.06/255 frente a 0.79 de variación natural del
degradado). **Resuelto** difuminando los bordes laterales del sprite un 3%.

### El hueso se veía geométrico y con picos
El contorno interior se recortaba con una máscara rectangular y el corte recto dejaba
picos junto al texto. **Resuelto** dibujándolo como arcos sueltos con trazo de punta
redonda, presentes solo en los extremos.

### El perro se veía borroso
Dos pérdidas superpuestas: el video fuente es 720p, y el atlas guarda celdas de 448 px.
**Mitigado** ocultando el sprite en la pose de reposo, donde se ve el fondo sin
trocear: 522 px de detalle real en vez de 325, sin cargar un byte más. El resto es
techo del material.

### La animación de mirar abajo casi no se apreciaba
El clip se cortó en el frame 84 porque ahí dejaba de crecer la métrica de divergencia,
pero **las orejas se doblan a partir del 96**. La métrica se satura y no distingue
"gira un poco más". **Resuelto** ampliando el rango a 132 y dando 26 celdas a ese radio
en vez de 20, para que el arranque no salte.

### La información flotaba en medio de la pantalla
Navegación y hero usaban el mismo contenedor centrado que el cuerpo del sitio.
**Resuelto** con un contenedor propio más ancho: a 1920 px pasan de 372 a 212 del borde.

### La primera tarjeta del carrusel se pegaba al borde
`scroll-snap-align: start` alinea con el borde del contenedor e ignora el relleno,
así que la pista arrancaba desplazada exactamente los 132 px del padding.
**Resuelto** añadiendo `scroll-padding-inline` con el mismo valor.

### El calendario abría vacío
Entrando un día 31, el mes en curso no tiene ni un hueco libre y parecía roto.
**Resuelto** abriendo en el mes siguiente cuando el actual ya no tiene disponibilidad.
Los días pasados tampoco se pintan como "ocupados", que no lo están.

### El menú hamburguesa no abría, y encima se volvía invisible
Nunca se implementó: era un botón sin nada detrás. Y sobre la parte blanca del
hero móvil su fondo translúcido blanco desaparecía. **Resuelto** con un panel
desplegable de verdad —cierra al elegir, al tocar fuera y con Escape— y
rehaciendo el hero móvil, que ahora es azul entero y deja el botón siempre
sobre fondo oscuro.

### En móvil el texto y el hueso quedaban fuera del hero
El hero móvil era mitad azul, mitad blanco, y el texto caía debajo del perro en
vez de encima. El primer intento —rellenar la pantalla de azul y difuminar al
perro— resolvió eso pero introdujo otro problema: azul de sobra y un perro
deshecho por abajo.

**Resuelto** dejando el hero en **16:9 exacto**, atado al ancho y no a la altura
de pantalla. A esa proporción la imagen no se recorta, así que se conserva su
composición original: el perro a la izquierda y aire a la derecha —131 px en una
pantalla de 390— donde cabe el hueso sin taparlo. Es la misma composición que en
escritorio, más pequeña.

Cuanto más alto es el hero, más recorta `cover` por los lados y más ancho ocupa
el perro: por eso el hueso se montaba encima de su cara.

### El texto del hueso chocaba con su propio contorno
A tamaño móvil "¿Reservamos?" no cabe en el cuerpo del hueso y se montaba sobre
las curvas de las puntas. **Mitigado** encogiendo la letra hasta que el choque
desaparece. La salida limpia sería una palabra más corta.

### Capturas de móvil que mentían
Las capturas con `--window-size=390` parecían mostrar el hueso cortado. En
realidad **Chrome en Windows no baja de ~500 px de ventana**: calculaba el
diseño a 504 px y recortaba la imagen a 390. Se comprueba leyendo `innerWidth`
desde dentro de la página. Para capturar un ancho real hay que meterla en un
iframe del tamaño deseado.

### No había favicon
`/favicon.ico` daba 404 y la pestaña salía en blanco. El logo es un wordmark
apaisado y a 32 px sería ilegible, así que el icono es **la cara del cachorro**,
recortada del propio fondo. A 16 px queda pastoso —inevitable con una foto— pero
se reconoce; a 32 y 48 se lee bien.

### Roturas del propio proceso
`index.html` se partió dos veces al editarlo buscando índices de cadenas: en ambos casos
el corte se llevó por delante medio documento. **Resuelto** generándolo desde
`site/rebuild_index.py`, que además calcula los arcos del hueso. El HTML no se edita
a mano.

---

## Estructura

```
site/            el sitio: HTML, CSS, JS y activos
  rebuild_index.py   genera index.html (no editar el HTML a mano)
framer/          el mismo efecto como componente de código de Framer
  build_atlas.py     reconstruye los atlas desde los clips
*.mp4            los ocho clips de origen, uno por dirección
ESTADO.md        notas técnicas y mediciones
```
