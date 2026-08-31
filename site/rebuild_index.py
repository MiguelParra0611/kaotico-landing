# Regenera site/index.html entero. Los arcos del contorno interior del hueso se
# calculan aqui, asi que el archivo no depende de pegar cadenas larguisimas.
import io, math, os

DEST = r"C:\Users\Lenovo\Desktop\Landpage kaotico\site\index.html"

CX, CYT, R = 250, 63, 27.5      # lobulo superior derecho y radio del eje del trazo
EJE_X, EJE_Y = 150, 85          # ejes de simetria del hueso


def arco(cx, cy, r, a0, a1, n=64):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
            for i in range(n + 1)]


def d(pts):
    return "M " + " L ".join("%.2f %.2f" % p for p in pts)


base = arco(CX, CYT, R, 53, -134)
grupos = [
    base,
    [(x, 2 * EJE_Y - y) for x, y in base],
    [(2 * EJE_X - x, y) for x, y in base],
    [(2 * EJE_X - x, 2 * EJE_Y - y) for x, y in base],
]
ARCOS = "\n".join('          <path d="%s"/>' % d(p) for p in grupos)

HTML = '''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kaótico · Pelos y Trufas — Estética canina</title>
<meta name="description" content="Kaótico · Pelos y Trufas. Estética canina con cita previa, guardería por horas o días y productos para tu perro.">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;650;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/styles.css">

<link rel="preload" as="image" href="assets/fondo.webp">
<link rel="preload" as="image" href="assets/atlas-lo.webp">
</head>
<body>

<a class="saltar" href="#quien">Saltar al contenido</a>

<!-- La navegación no tiene barra propia: flota sobre el hero y solo se
     convierte en barra blanca cuando el hero deja de estar en pantalla. -->
<nav class="nav" id="nav" data-fuera="no" aria-label="Principal">
  <div class="contenedor">
    <a class="marca" href="#">
      <b>KAÓTICO</b>
      <small>Pelos y Trufas</small>
    </a>

    <div class="enlaces">
      <a href="#productos">Productos</a>
      <a href="#servicios">Servicios</a>
      <a href="#agenda">Agenda</a>
      <a href="#contacto">Contacto</a>
    </div>

    <button class="menu-btn" type="button" aria-label="Abrir menú" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 7h16M4 12h16M4 17h16"/>
      </svg>
    </button>
  </div>
</nav>

<header class="hero">
  <div class="hero-lienzo">
    <div class="hero-fondo"></div>
    <div class="hero-sprite" id="sprite"></div>
  </div>
  <div class="hero-velo"></div>

  <div class="hero-capa">
    <div class="contenedor">
      <div class="hero-gancho">
        <h1>
          <span class="linea-1">Tu perro sale de aquí <em>irreconocible</em></span>
          <span class="linea-2">Para bien</span>
        </h1>
        <p class="linea-3">40 perros atendidos este año.</p>
      </div>
    </div>
  </div>

  <!-- A la derecha, a media altura: justo donde el cachorro mira sacando la
       lengua. El hueso es el único elemento pulsable del hero. -->
  <div class="hueso-sitio">
    <a class="hueso" href="#agenda">
      <!-- Contorno exterior: se resta una silueta encogida a la silueta completa,
           asi el azul del fondo se ve por dentro y no hay relleno. -->
      <svg class="hueso-svg" viewBox="0 0 300 170" aria-hidden="true" focusable="false">
        <defs>
          <mask id="k-borde">
            <g fill="#fff">
              <rect x="50" y="57" width="200" height="56"/>
              <circle cx="50" cy="63" r="44"/><circle cx="50" cy="107" r="44"/>
              <circle cx="250" cy="63" r="44"/><circle cx="250" cy="107" r="44"/>
            </g>
            <g fill="#000">
              <rect x="50" y="64" width="200" height="42"/>
              <circle cx="50" cy="63" r="37"/><circle cx="50" cy="107" r="37"/>
              <circle cx="250" cy="63" r="37"/><circle cx="250" cy="107" r="37"/>
            </g>
          </mask>
        </defs>
        <rect width="300" height="170" fill="currentColor" mask="url(#k-borde)"/>
        <!-- Contorno interior: arcos sueltos sobre cada bulto, no una silueta
             recortada. Recortarla con un rectangulo dejaba picos junto al texto;
             con trazo de punta redonda las lineas mueren suaves y solo existen
             en los extremos. -->
        <g fill="none" stroke="currentColor" stroke-width="5"
           stroke-linecap="round" stroke-linejoin="round">
__ARCOS__
        </g>
      </svg>
      <span>¿Reservamos?</span>
    </a>
  </div>
</header>

<main>

  <section class="seccion" id="quien">
    <div class="contenedor quien">
      <div class="quien-texto">
        <span class="rotulo">Quién soy</span>
        <h2>Un perro cada vez, y todo el tiempo que necesite.</h2>
        <p class="intro">
          Aquí no hay línea de montaje ni jaulas de espera. Tu perro llega, se le mira
          el pelaje, la piel y sobre todo el ánimo, y a partir de ahí decidimos qué
          necesita. Si viene nervioso, vamos despacio. Si viene hecho un desastre,
          se le dice antes de empezar.
        </p>
        <ul class="lista-marcas">
          <li>Un solo perro en el local a la vez</li>
          <li>Se avisa el precio antes de tocar tijera</li>
          <li>Si algo en la piel no pinta bien, se te dice</li>
        </ul>
        <div class="pendiente">
          <b>Falta tu voz:</b> este texto lo escribí yo a partir de cómo me describiste
          el trabajo. Léelo y cámbialo por lo que tú dirías — esta sección funciona
          cuando suena a la persona, no a una web.
        </div>
      </div>

      <figure class="quien-foto">
        <div class="hueco-foto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2.5"/>
            <circle cx="8.5" cy="9.5" r="1.8"/>
            <path d="M3 16.5l4.5-4a2 2 0 0 1 2.7 0L15 17"/>
            <path d="M14 14.5l2-1.8a2 2 0 0 1 2.7 0L21 15"/>
          </svg>
          <span>Foto del dueño trabajando</span>
        </div>
      </figure>
    </div>
  </section>

  <section class="seccion seccion-gris" id="servicios">
    <div class="contenedor">
      <span class="rotulo">Servicios</span>
      <h2>Lo que hacemos.</h2>
      <p class="intro">
        Estética canina como oficio principal. Guardería cuando se puede, y los
        productos que tu perro necesite para seguir bien en casa.
      </p>

      <div class="tarjetas">
        <article class="tarjeta tarjeta-destacada">
          <h3>Estética canina</h3>
          <p>Baño, corte, uñas, oídos y deslanado. La sesión completa, sin prisa.</p>
          <p class="precio">
            <span class="precio-desde">Perros pequeños desde</span>
            <b>$40.000</b>
          </p>
          <p class="precio-nota">
            El valor final depende del estado del pelaje. Otros tamaños se cotizan.
          </p>
        </article>

        <article class="tarjeta">
          <h3>Guardería</h3>
          <p>
            Unas horas o unos días, cuando la vida se complica. Uno o dos perros a la
            vez, nunca más, para que sigan siendo huéspedes y no inventario.
          </p>
          <p class="precio-nota">Se acuerda por WhatsApp según las fechas.</p>
        </article>

        <article class="tarjeta">
          <h3>Productos</h3>
          <p>
            Alimentación, vacunas y lo que haga falta para el cuidado en casa.
            Se consigue por encargo si no está a mano.
          </p>
          <p class="precio-nota">Pregunta disponibilidad por WhatsApp.</p>
        </article>
      </div>

      <!-- Este bloque existe porque el negocio NO tiene tarifa fija: explicarlo
           es mejor que esconderlo, y evita la conversación incómoda en la puerta. -->
      <div class="porque">
        <div class="porque-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="12" cy="12" r="9.2"/>
            <path d="M12 11v5.4M12 7.6v.9"/>
          </svg>
        </div>
        <div>
          <h3>¿Por qué no hay una tarifa cerrada?</h3>
          <p>
            Porque no es lo mismo un perro que viene cada mes que uno con nudos
            apelmazados, pulgas o la piel irritada. Bañar al primero son cuarenta
            minutos; desenredar al segundo sin hacerle daño puede ser el doble de
            trabajo. Poner un único número obligaría a cobrarte de más o a cambiarte
            el precio en la puerta.
          </p>
          <p class="porque-accion">
            <b>Mándanos una foto de tu perro por WhatsApp</b> y te decimos qué necesita
            y cuánto vale antes de que salgas de casa.
          </p>
        </div>
      </div>
    </div>
  </section>

  <section class="seccion" id="productos">
    <div class="contenedor">
      <span class="rotulo">Productos</span>
      <h2>Alimentación, vacunas y lo que haga falta.</h2>
      <div class="pendiente"><b>Siguiente paso:</b> catálogo y consulta por WhatsApp.</div>
    </div>
  </section>

  <section class="seccion seccion-gris" id="agenda">
    <div class="contenedor">
      <span class="rotulo">Agenda</span>
      <h2>Reserva tu cita.</h2>
      <div class="pendiente">
        <b>Siguiente paso:</b> el calendario. Días ocupados y horarios serán inventados
        para la demo, y hay que sustituirlos antes de que la página reciba clientes reales.
      </div>
    </div>
  </section>

  <section class="seccion" id="contacto">
    <div class="contenedor">
      <span class="rotulo">Contacto</span>
      <h2>Escríbenos por WhatsApp.</h2>
      <p class="intro">
        Mándanos una foto de tu perro y te decimos qué necesita y cuánto vale, antes de venir.
      </p>
      <div class="pendiente"><b>Siguiente paso:</b> horarios, ubicación y mapa.</div>
    </div>
  </section>

</main>

<a class="wpp" href="https://wa.me/" target="_blank" rel="noopener"
   aria-label="Escríbenos por WhatsApp">
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29z"/>
  </svg>
</a>

<script type="module">
  import { crearGaze } from "./js/gaze.js";

  crearGaze(document.getElementById("sprite"), {
    atlasLo: "assets/atlas-lo.webp",
    atlasHi: "assets/atlas-hi.webp",
    reachX: 0.5,
    reachY: 0.5,
    // La respiracion de reposo movia la pose fuera de la celda central, y con
    // ella se perdia el perro nitido del fondo justo al cargar la pagina.
    // Nitidez en el primer vistazo > movimiento sutil que nadie pidio.
    idle: false,
  });

  // La navegación se vuelve barra blanca solo cuando el hero sale de pantalla
  const nav = document.getElementById("nav");
  const hero = document.querySelector(".hero");
  new IntersectionObserver(
    ([e]) => { nav.dataset.fuera = e.isIntersecting ? "no" : "si"; },
    { rootMargin: "-70px 0px 0px 0px" }
  ).observe(hero);
</script>

</body>
</html>
'''

io.open(DEST, "w", encoding="utf-8").write(HTML.replace("__ARCOS__", ARCOS))
print("index.html regenerado:", os.path.getsize(DEST), "bytes")
