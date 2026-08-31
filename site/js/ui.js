/**
 * ui.js — carrusel de productos y calendario de la agenda.
 *
 * La disponibilidad del calendario es INVENTADA. Vive detrás de `agenda`, que
 * es la única pieza que habla de datos: el día que haya reservas de verdad se
 * cambia ese objeto por una consulta al servidor y la interfaz no se entera.
 */

/* ---------------------------------------------------------------- carrusel */

export function crearCarrusel(pista, botones) {
  if (!pista) return;

  const paso = () => {
    const tarjeta = pista.querySelector(":scope > *");
    if (!tarjeta) return pista.clientWidth * 0.8;
    const ancho = tarjeta.getBoundingClientRect().width;
    const hueco = parseFloat(getComputedStyle(pista).gap) || 0;
    // se avanza de tarjeta en tarjeta, las que quepan menos una para no perder
    // el hilo de lo que ya se estaba mirando
    const caben = Math.max(1, Math.floor(pista.clientWidth / (ancho + hueco)) - 1);
    return (ancho + hueco) * caben;
  };

  const refrescar = () => {
    const max = pista.scrollWidth - pista.clientWidth - 2;
    botones.forEach((b) => {
      const atras = Number(b.dataset.dir) < 0;
      b.disabled = atras ? pista.scrollLeft <= 2 : pista.scrollLeft >= max;
    });
  };

  botones.forEach((b) =>
    b.addEventListener("click", () => {
      pista.scrollBy({ left: paso() * Number(b.dataset.dir) });
    })
  );
  pista.addEventListener("scroll", refrescar, { passive: true });
  addEventListener("resize", refrescar);
  refrescar();
}

/* --------------------------------------------------------------- calendario */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* Ocupación inventada pero ESTABLE: la misma fecha da siempre el mismo
   resultado, para que cambiar de mes y volver no baraje los días. */
function ocupado(anio, mes, dia) {
  let h = (anio * 12 + mes) * 31 + dia;
  h = (h * 2654435761) % 4294967296;
  return (h % 100) < 38;          // ~38% de los días laborables
}

export function crearCalendario({ titulo, rejilla, hoja, navs }) {
  if (!titulo || !rejilla || !hoja) return;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let anio = hoy.getFullYear();
  let mes = hoy.getMonth();

  function pintar() {
    titulo.textContent = `${MESES[mes]} de ${anio}`;
    rejilla.textContent = "";

    // lunes primero: getDay() da 0 para domingo
    const primero = (new Date(anio, mes, 1).getDay() + 6) % 7;
    const dias = new Date(anio, mes + 1, 0).getDate();

    for (let i = 0; i < primero; i++) {
      const v = document.createElement("div");
      v.className = "cal-dia vacio";
      rejilla.append(v);
    }

    for (let d = 1; d <= dias; d++) {
      const fecha = new Date(anio, mes, d);
      const finde = fecha.getDay() === 0;                 // domingo cerrado
      const pasado = fecha < hoy;
      const libre = !finde && !pasado && !ocupado(anio, mes, d);

      // un dia pasado no esta "ocupado": simplemente ya no se puede pedir
      const estado = pasado ? "pasado" : finde ? "cerrado" : libre ? "libre" : "ocupado";
      const celda = document.createElement(libre ? "button" : "div");
      celda.className = "cal-dia " + estado;
      celda.textContent = d;
      if (libre) celda.type = "button";
      celda.setAttribute("aria-label",
        `${d} de ${MESES[mes]}: ` +
        (libre ? "libre. Escríbenos para reservar" : estado));
      rejilla.append(celda);
    }
  }

  /* El giro de hoja: sale por un canto y entra por el otro, para que se lea
     como pasar una página y dejarla detrás. */
  let animando = false;
  function cambiar(dir) {
    if (animando) return;
    animando = true;
    const adelante = dir > 0;

    hoja.dataset.vuelta = adelante ? "sale-adelante" : "sale-atras";
    setTimeout(() => {
      mes += dir;
      if (mes > 11) { mes = 0; anio++; }
      if (mes < 0) { mes = 11; anio--; }
      pintar();

      hoja.dataset.vuelta = adelante ? "entra-adelante" : "entra-atras";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        delete hoja.dataset.vuelta;
        animando = false;
      }));
    }, 270);
  }

  navs.forEach((b) => b.addEventListener("click", () => cambiar(Number(b.dataset.mes))));

  pintar();
  /* Si el mes en curso ya no tiene un solo hueco -por ejemplo, se entra el dia
     31- se abre directamente en el siguiente. Un calendario vacio al cargar
     parece roto aunque sea correcto. */
  if (!rejilla.querySelector(".libre")) {
    mes++;
    if (mes > 11) { mes = 0; anio++; }
    pintar();
  }
}
