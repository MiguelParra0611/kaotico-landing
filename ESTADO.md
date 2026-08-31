# Kaótico · Pelos y Trufas — estado del proyecto

Landing para un negocio real de estética canina. **Ahora mismo es pieza de portafolio**:
no recibirá clientes hasta más adelante, pero la arquitectura debe permitir enchufar
reservas reales sin rehacerla.

- Marca: **Kaótico**, eslogan **Pelos y Trufas**
- WhatsApp: **no vive en el repositorio.** El enlace apunta a `wa.me/` sin
  destinatario hasta que el dueño dé el visto bueno al proyecto.
- Servicios: estética canina (el fuerte), guardería esporádica, venta de alimentación y vacunas

---

## Cómo levantar el sitio

```bash
python -m http.server 5173
```

Luego abrir `http://localhost:5173/site/index.html`.

`site/` es HTML/CSS/JS estático, sin build. Se despliega arrastrando la carpeta a
Vercel o Netlify.

---

## Lo que está hecho

### El efecto: el cachorro sigue el cursor

`site/js/gaze.js` — atlas de **167 poses** (1 celda central + **8 radios**; 20 celdas
cada uno salvo S, que lleva 26 por tener el recorrido más largo).
El radio se elige por el **ángulo** del cursor y se avanza por su **magnitud**.
Cambiar de pose cuesta un `background-position`: sin decodificar video, sin buscar
en una línea de tiempo, sin fundidos.

El fondo va **aparte** (`assets/fondo.webp`) porque no cambia entre poses. Eso permite
que el cuadro sea 16:9 mientras el atlas solo carga al perro.

Decisiones que costaron medirlas y **no conviene deshacer sin releer esto**:

- **El sprite se escala igual que el fondo** con unidades de contenedor. Si se rompe
  esa fórmula, el degradado de la celda deja de empalmar con el de alrededor.
- **Los bordes laterales del sprite van difuminados un 3%.** Sin eso hay una costura
  vertical visible (medida: 5.06/255 frente a 0.79 de variación natural).
- **En la pose de reposo el sprite se oculta** y se ve el perro del fondo, que llega
  sin trocear: 522 px de ancho real contra 325 de la celda, un 60% más de detalle
  gratis. Por eso `idle: false` — la respiración movía la pose fuera del centro y
  se perdía esa nitidez.

### Secciones

`site/index.html` — hero, "Quién soy", "Servicios", "Asesorías", "Productos" (carrusel),
"Agenda" (calendario) y "Contacto". El carrusel y el calendario viven en `site/js/ui.js`.

**La disponibilidad del calendario es inventada** y determinista: la misma fecha da
siempre el mismo resultado. Está aislada en la función `ocupado()` de `ui.js` — el día
que haya reservas reales se cambia esa función y la interfaz no se entera.

**Los horarios de contacto también son inventados** (L-V 8:00-17:00, S 8:00-13:00).

**`index.html` se regenera** desde `site/rebuild_index.py`,
que también calcula los arcos del hueso. Editarlo a mano por búsqueda de índices ya
rompió el archivo dos veces.

### Componente de Framer

Los atlas se reconstruyen con `framer/build_atlas.py` (los rangos de cada radio
están ahí). `framer/GazeStar.tsx` con `atlas-hi.webp`, `atlas-lo.webp`, `fondo.webp` y `atlas.json`.
Misma lógica que `gaze.js`. Los controles solo aparecen al seleccionar una **instancia**
en el lienzo, no en el editor de código.

---

## Lo que falta

1. **Agenda** — el calendario. La pieza con más lógica y la que queda por hacer.
   Plan acordado: interfaz real con una **capa de datos aislada** (un solo módulo).
   Hoy guarda en el navegador; el día que haga falta se cambia ese módulo por
   Supabase o Neon **sin tocar la interfaz**.
2. **Productos** — catálogo simple, consulta por WhatsApp. No hace falta tienda.
3. **Contacto** — horarios, ubicación, mapa.
4. **Fotos reales** del dueño y de antes/después. Los huecos ya están marcados.
5. **El texto de "Quién soy" lo escribí yo.** Lleva un aviso pidiendo su voz.

---

## Cuidado con esto

**Contenido inventado que no puede publicarse tal cual:** horarios, días ocupados del
calendario y cualquier cifra. El dueño autorizó inventarlos para la demo. La única
cifra real que dio es **~40 perros al año**.

**Los precios no son fijos y no deben publicarse como si lo fueran.** Evalúa cada perro
y cobra según lo que encuentre (nudos, pulgas, mugre, piel). Referencia confirmada:
**$40.000–$50.000 COP** para baño y corte de **perro pequeño**. No hay tarifa para otros
tamaños: se cotiza por WhatsApp. La sección de servicios ya lo explica en vez de esconderlo.

---

## Calidad de imagen: los números, para no rehacer el análisis

El video fuente es **720p**. El recorte del perro son 720×720 px nativos: ese es el techo.

| origen | ancho real del perro |
|---|---|
| celda del atlas (448 px) | 325 px |
| `fondo.webp` (pose de reposo) | 522 px |
| `yorkshire-landing-page.jpg` | 564 px |

La imagen base aporta solo un 8% sobre el fondo que ya está cargado, **y su proporción
es 1.7917 en vez de 1.7778**, así que habría que alinearla. No compensa: se descartó.

**Regenerar los clips a 1080p no mejoraría nada visible**, porque el cuello de botella
es la celda del atlas (448), no la fuente (720). Para aprovechar 1080p habría que subir
las celdas por encima de 720, y eso se va a ~74 megapíxeles. Inviable.

Tabla de intercambio a igual peso (~3 MB), por si se quiere más nitidez a costa de poses:

| celda | poses/radio | ampliación a 1125 px |
|---|---|---|
| 448 | 20 | 2.51× ← actual |
| 560 | 14 | 2.01× |
| 640 | 12 | 1.76× |
| 720 | 10 | 1.56× ← el techo |

---

## Lo único que mejoraría el movimiento

Salto de pose en cada bisectriz entre radios vecinos:

| cruce | salto | | cruce | salto |
|---|---|---|---|---|
| **SW → W** | **36.3** | | NW → N | 28.1 |
| S → SW | 35.9 | | NE → E | 27.9 |
| SE → S | 34.8 | | N → NE | 26.5 |
| W → NW | 25.7 | | E → SE | 25.0 |

Antes de sustituir el clip de abajo el peor era S→SW con 40.6. Ahora el peor es
**SW → W**, y ya no involucra a S.

Queda una mejora sin material nuevo: **SE (38.8) y SW (38.1) giran más que sus vecinos**
(la mediana es 32.7; N se queda en 24.3). Recortar sus rangos —SW de 168 a ~99, SE de 120
a ~58— igualaría las amplitudes y bajaría los cruces, **a cambio de que el perro gire
menos** en esas dos direcciones. Es un intercambio de expresividad por uniformidad, sin
decidir.

---

## Material

| clip | dirección | rango útil | anclaje a la base |
|---|---|---|---|
| `HORIZONTAL.mp4` | E (derecha) | 3–101 | 3.26 |
| `TURNUPRIGHT.mp4` | NE | 6–156 | 1.49 |
| `Puppy_looking_in_four_directions` | N (arriba) | 6–34 | 3.26 |
| `TURNUPLEFT.mp4` | NW | 5–105 | 1.48 |
| `TURNLEFT.mp4` | W (izquierda) | 6–112 | 1.62 |
| `TURNDOWNLEFT.mp4` | SW | 3–168 | 1.47 |
| `TURNDOWN.mp4` | S (abajo) | 3–132 | 1.45 | ← 26 celdas |
| `TURNDOWNRIGHT.mp4` | SE | 2–120 | 1.47 |

Todos arrancan de la **misma imagen base**, y por eso comparten la celda 0 como centro
exacto. `LEFT.mp4` es un intento fallido (endereza la cabeza, no gira): **no usar**.
`puppy_scrub*.mp4`, `GazeVideo.tsx`, `GazeHead.tsx` y `VERTICAL.mp4` son de intentos
anteriores y ya no se usan. `VERTICAL.mp4` se sustituyó por `TURNDOWN.mp4`: aquel bajaba
los párpados en vez de girar la cabeza, y por eso no empalmaba con sus vecinos.

El rango de S llega al 132 **a propósito**: las orejas se doblan a partir del frame 96 y
cortar antes se dejaba fuera lo mejor de la animación.
