/**
 * gaze.js — el cachorro sigue el cursor.
 *
 * Un atlas precargado con 167 poses: una celda central y ocho radios de 20.
 * El radio se elige por el ANGULO del cursor y se avanza por su MAGNITUD.
 * Cambiar de pose cuesta un background-position: sin decodificar video, sin
 * buscar en una linea de tiempo y sin fundidos.
 *
 * El fondo va aparte porque no cambia entre poses (deriva medida: 1.9/255).
 * Eso permite que el cuadro sea 16:9 mientras el atlas solo carga al perro.
 */

const COLS = 13;
const ROWS = 13;
const CENTER = 0;

// Ocho radios: el error angular maximo entre el cursor y la pose real es 22.5.
const RADIOS = [
  { nom: "E",  ang:    0, ini:   1, len: 20 },
  { nom: "NE", ang:  -45, ini:  21, len: 20 },
  { nom: "N",  ang:  -90, ini:  41, len: 20 },
  { nom: "NW", ang: -135, ini:  61, len: 20 },
  { nom: "W",  ang:  180, ini:  81, len: 20 },
  { nom: "SW", ang:  135, ini: 101, len: 20 },
  { nom: "S",  ang:   90, ini: 121, len: 26 },   // recorrido mas largo: mas celdas
  { nom: "SE", ang:   45, ini: 147, len: 20 },
];

const GRADOS = 180 / Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function crearGaze(sprite, opciones = {}) {
  const cfg = Object.assign(
    { reachX: 0.5, reachY: 0.5, smoothing: 0.16, nudgeX: 18, nudgeY: 16,
      deadZone: 0.04, idle: true, atlasLo: "", atlasHi: "" },
    opciones
  );

  let atlas = cfg.atlasLo || cfg.atlasHi;
  let hiListo = false;

  function aplicarAtlas() {
    sprite.style.backgroundImage = `url(${atlas})`;
    sprite.style.backgroundSize = `${COLS * 100}% ${ROWS * 100}%`;
  }
  aplicarAtlas();

  const ahorro = navigator.connection && navigator.connection.saveData === true;

  /* Unica pieza de logica del efecto. Todo lo demas es pintar. */
  function elegirCelda(nx, ny) {
    const m = Math.min(1, Math.hypot(nx, ny));
    const ang = Math.atan2(ny, nx) * GRADOS;

    let mejor = RADIOS[0], err = Infinity;
    for (const r of RADIOS) {
      let d = Math.abs(ang - r.ang);
      if (d > 180) d = 360 - d;
      if (d < err) { err = d; mejor = r; }
    }

    /* Entre dos radios ninguno es correcto y al cruzar la bisectriz la pose
       saltaria. Se acerca al centro segun el error angular: los radios
       convergen ahi, asi que el salto se encoge. */
    const mEf = m * Math.pow(Math.max(Math.cos(err / GRADOS), 0), 2.5);
    const celda = mEf < cfg.deadZone
      ? CENTER
      : mejor.ini + Math.min(mejor.len - 1, Math.round(mEf * (mejor.len - 1)));

    const rad = mejor.ang / GRADOS;
    return {
      celda,
      resX: nx - mEf * Math.cos(rad),
      resY: ny - mEf * Math.sin(rad),
    };
  }

  let ocultoEnReposo = null;

  function pintar(nx, ny) {
    const r = elegirCelda(nx, ny);

    /* En la pose de reposo el sprite es redundante: la celda 0 es el mismo
       frame que la imagen de fondo, que esta justo debajo y llega SIN trocear.
       El perro mide ahi 522 px de ancho real contra los 325 de la celda, asi
       que ocultar el sprite en reposo gana un 60% de detalle sin cargar nada.
       El cambio ocurre justo cuando empieza el movimiento, que es cuando menos
       se nota; no se le pone transicion para no mezclar dos poses distintas. */
    const enReposo = r.celda === CENTER;
    if (enReposo !== ocultoEnReposo) {
      sprite.style.visibility = enReposo ? "hidden" : "visible";
      ocultoEnReposo = enReposo;
    }

    const col = r.celda % COLS;
    const row = (r.celda / COLS) | 0;
    sprite.style.backgroundPosition =
      `${((col * 100) / (COLS - 1)).toFixed(4)}% ${((row * 100) / (ROWS - 1)).toFixed(4)}%`;
    /* Se escriben variables, no un transform completo: asi cada maquetacion
       decide como se coloca el sprite y el gesto de la mirada se suma encima
       sin pisarlo. */
    sprite.style.setProperty("--gesto-x", `${(r.resX * cfg.nudgeX).toFixed(2)}px`);
    sprite.style.setProperty("--gesto-y", `${(-r.resY * cfg.nudgeY).toFixed(2)}deg`);
  }

  const objetivo = { x: 0, y: 0 };
  const ahora = { x: 0, y: 0 };
  let raf = null, vistoPuntero = false, t0 = 0;

  /* El atlas grande (3 MB) no se pide por lo que el dispositivo DICE ser al
     cargar, sino cuando de verdad aparece un raton moviendose. Preguntar
     "(pointer: fine)" una sola vez deja fuera a los portatiles tactiles y a
     quien enchufa el raton despues. */
  function pedirAtlasAlta() {
    if (hiListo || !cfg.atlasHi || ahorro) return;
    hiListo = true;   // marca la peticion, no la llegada
    const img = new Image();
    img.src = cfg.atlasHi;
    const listo = () => {
      atlas = cfg.atlasHi;
      aplicarAtlas();
      pintar(ahora.x, ahora.y);
    };
    img.decode ? img.decode().then(listo, listo) : (img.onload = listo);
  }

  function paso(ts) {
    raf = null;
    if (!t0) t0 = ts;
    ahora.x += (objetivo.x - ahora.x) * cfg.smoothing;
    ahora.y += (objetivo.y - ahora.y) * cfg.smoothing;

    // respiracion sutil mientras nadie ha movido el cursor
    let bx = 0, by = 0;
    if (cfg.idle && !vistoPuntero) {
      const t = (ts - t0) / 1000;
      bx = Math.sin(t * 0.6) * 0.16;
      by = Math.sin(t * 0.8 + 1.3) * 0.10;
    }
    pintar(clamp(ahora.x + bx, -1, 1), clamp(ahora.y + by, -1, 1));

    const moviendo =
      Math.abs(objetivo.x - ahora.x) > 0.0015 ||
      Math.abs(objetivo.y - ahora.y) > 0.0015;
    if (moviendo || (cfg.idle && !vistoPuntero)) programar();
  }
  function programar() { if (raf === null) raf = requestAnimationFrame(paso); }

  /* La preferencia de movimiento reducido se vigila, no se lee una vez: el
     usuario puede cambiarla con la pagina abierta. */
  const mqQuieto = matchMedia("(prefers-reduced-motion: reduce)");
  let activo = !mqQuieto.matches;
  const cambioMovimiento = (e) => {
    activo = !e.matches;
    if (!activo) { objetivo.x = 0; objetivo.y = 0; programar(); }
  };
  mqQuieto.addEventListener("change", cambioMovimiento);
  pintar(0, 0);

  const onMove = (e) => {
    /* Se decide por evento, no por lo que el dispositivo dijo ser al cargar.
       Un dedo no es un cursor: arrastrar para hacer scroll no debe girar la
       cabeza. Un raton o un lapiz si, aunque el aparato tambien sea tactil. */
    if (e.pointerType === "touch") return;
    pedirAtlasAlta();
    if (!activo) return;
    const r = sprite.parentElement.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    objetivo.x = clamp((e.clientX - cx) / Math.max(1, innerWidth * cfg.reachX), -1, 1);
    objetivo.y = clamp((e.clientY - cy) / Math.max(1, innerHeight * cfg.reachY), -1, 1);
    vistoPuntero = true;
    programar();
  };
  const onLeave = () => { objetivo.x = 0; objetivo.y = 0; programar(); };

  addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave);
  programar();

  return {
    destruir() {
      removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      mqQuieto.removeEventListener("change", cambioMovimiento);
      if (raf !== null) cancelAnimationFrame(raf);
    },
  };
}
