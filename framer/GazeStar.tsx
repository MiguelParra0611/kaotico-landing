import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

/**
 * GazeStar — el cachorro sigue el cursor con poses reales.
 *
 * COMO FUNCIONA
 * Un atlas de imagenes precargado con 167 poses: una celda central y ocho radios. El radio se elige por el ANGULO del cursor y se
 * avanza por su MAGNITUD. Cambiar de pose cuesta un background-position: cero
 * decodificacion, cero busqueda en el tiempo, cero fundidos.
 *
 * POR QUE NO ES UN VIDEO
 * currentTime es un solo numero y no puede representar una direccion en dos
 * ejes; ademas cada salto en un <video> cuesta milisegundos, que es lo que se
 * percibe como entrecortado. Y fundir dos poses por opacidad no genera la pose
 * intermedia, genera dos perros translucidos superpuestos.
 *
 * POR QUE EL FONDO VA APARTE
 * El fondo azul no cambia entre poses (deriva medida: 1.9/255 dentro de cada
 * clip, 1.15 entre clips, por debajo del ruido de compresion). Sacarlo del
 * atlas permite que el cuadro sea 16:9 mientras el atlas solo carga al perro,
 * que ocupa el 56.25% central del ancho.
 *
 * LOS OCHO RADIOS
 * Cada uno sale de un clip propio que arranca en la misma imagen base, asi que
 * todos comparten la celda 0 como centro exacto. Con ocho radios el error
 * angular maximo entre el cursor y la pose real es de 22.5 grados.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 800
 * @framerIntrinsicHeight 450
 */

// --- Disposicion del atlas. Debe coincidir con framer/atlas.json ---------
const COLS = 13
const ROWS = 13
const CENTER = 0
const CROP_X = 0.24375 // el recorte cuadrado empieza aqui dentro del 16:9
const CROP_W = 0.5625 // y mide esto de ancho

type Radio = { nom: string; ang: number; ini: number; len: number }
const RADIOS: Radio[] = [
    { nom: "E", ang: 0, ini: 1, len: 20 },
    { nom: "NE", ang: -45, ini: 21, len: 20 },
    { nom: "N", ang: -90, ini: 41, len: 20 },
    { nom: "NW", ang: -135, ini: 61, len: 20 },
    { nom: "W", ang: 180, ini: 81, len: 20 },
    { nom: "SW", ang: 135, ini: 101, len: 20 },
    { nom: "S", ang: 90, ini: 121, len: 26 }, // recorrido mas largo: mas celdas
    { nom: "SE", ang: 45, ini: 147, len: 20 },
]

const GRADOS = 180 / Math.PI

interface Props {
    atlasHi?: string | { src?: string } | null
    atlasLo?: string | { src?: string } | null
    fondo?: string | { src?: string } | null
    // Escapes por si Framer reescala el atlas al optimizarlo: una URL directa
    // se usa tal cual y tiene prioridad sobre la imagen subida.
    atlasHiURL?: string
    atlasLoURL?: string
    fondoURL?: string
    reachX?: number
    reachY?: number
    smoothing?: number
    nudgeX?: number
    nudgeY?: number
    deadZone?: number
    idle?: boolean
    borderRadius?: number
    debug?: boolean
}

const D = {
    reachX: 0.5,
    reachY: 0.5,
    smoothing: 0.16,
    nudgeX: 18,
    nudgeY: 16,
    deadZone: 0.04,
    idle: true,
    borderRadius: 0,
    debug: false,
}

function num(v: unknown, f: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : f
}
function bool(v: unknown, f: boolean): boolean {
    return typeof v === "boolean" ? v : f
}
function clamp(v: number, a: number, b: number) {
    return v < a ? a : v > b ? b : v
}
function resolveSrc(v: Props["atlasHi"]): string {
    if (!v) return ""
    if (typeof v === "string") return v.trim()
    if (typeof v === "object" && typeof (v as any).src === "string")
        return (v as any).src.trim()
    return ""
}

export default function GazeStar(props: Props) {
    const reachX = Math.max(0.05, num(props.reachX, D.reachX))
    const reachY = Math.max(0.05, num(props.reachY, D.reachY))
    const smoothing = clamp(num(props.smoothing, D.smoothing), 0.02, 1)
    const nudgeX = num(props.nudgeX, D.nudgeX)
    const nudgeY = num(props.nudgeY, D.nudgeY)
    const deadZone = clamp(num(props.deadZone, D.deadZone), 0, 0.5)
    const idle = bool(props.idle, D.idle)
    const borderRadius = num(props.borderRadius, D.borderRadius)
    const debug = bool(props.debug, D.debug)

    const isStatic = useIsStaticRenderer()
    const rootRef = useRef<HTMLDivElement | null>(null)
    const spriteRef = useRef<HTMLDivElement | null>(null)
    const rafRef = useRef<number | null>(null)

    const target = useRef({ x: 0, y: 0 })
    const now = useRef({ x: 0, y: 0 })
    const vistoPuntero = useRef(false)
    const t0 = useRef(0)

    const cfg = useRef({ reachX, reachY, smoothing, nudgeX, nudgeY, deadZone, idle })
    cfg.current = { reachX, reachY, smoothing, nudgeX, nudgeY, deadZone, idle }

    const url = (u: unknown) => (typeof u === "string" ? u.trim() : "")
    const srcHi = useMemo(
        () => url(props.atlasHiURL) || resolveSrc(props.atlasHi),
        [props.atlasHiURL, props.atlasHi]
    )
    const srcLo = useMemo(
        () => url(props.atlasLoURL) || resolveSrc(props.atlasLo),
        [props.atlasLoURL, props.atlasLo]
    )
    const srcFondo = useMemo(
        () => url(props.fondoURL) || resolveSrc(props.fondo),
        [props.fondoURL, props.fondo]
    )

    const [hiListo, setHiListo] = useState(false)
    const [dbg, setDbg] = useState({ nx: 0, ny: 0, radio: "centro", celda: 0 })

    /* El atlas grande solo se descarga donde sirve de algo: con puntero fino y
       sin peticion de ahorro de datos. En tactil no hay cursor que seguir, asi
       que el ligero basta y nos ahorramos 2.4 MB. */
    useEffect(() => {
        if (isStatic || !srcHi) return
        const finoOk =
            typeof matchMedia === "function"
                ? matchMedia("(pointer: fine)").matches
                : true
        const ahorro = (navigator as any)?.connection?.saveData === true
        if (!finoOk || ahorro) return

        let vivo = true
        const img = new Image()
        img.src = srcHi
        const listo = () => {
            if (vivo) setHiListo(true)
        }
        if (typeof img.decode === "function") {
            img.decode().then(listo, listo)
        } else {
            img.onload = listo
            img.onerror = listo
        }
        return () => {
            vivo = false
        }
    }, [srcHi, isStatic])

    const atlasActivo = hiListo && srcHi ? srcHi : srcLo || srcHi

    /* Elige la celda para una direccion de cursor dada. Es la unica pieza de
       logica del efecto; todo lo demas es pintar. */
    const elegirCelda = useCallback((nx: number, ny: number) => {
        const c = cfg.current
        const m = Math.min(1, Math.hypot(nx, ny))
        const ang = Math.atan2(ny, nx) * GRADOS

        let mejor = RADIOS[0]
        let err = 1e9
        for (const r of RADIOS) {
            let d = Math.abs(ang - r.ang)
            if (d > 180) d = 360 - d
            if (d < err) {
                err = d
                mejor = r
            }
        }

        /* Entre dos radios ninguno es correcto y al cruzar la bisectriz la pose
           saltaria. Se acerca al centro segun el error angular: los radios
           convergen ahi, asi que el salto se encoge. */
        const mEf = m * Math.pow(Math.max(Math.cos(err / GRADOS), 0), 2.5)

        const celda =
            mEf < c.deadZone
                ? CENTER
                : mejor.ini + Math.min(mejor.len - 1, Math.round(mEf * (mejor.len - 1)))

        const rad = mejor.ang / GRADOS
        return {
            celda,
            nombre: mEf < c.deadZone ? "centro" : mejor.nom,
            // lo que el radio elegido no cubre, para insinuarlo con CSS
            resX: nx - mEf * Math.cos(rad),
            resY: ny - mEf * Math.sin(rad),
        }
    }, [])

    const pintar = useCallback(
        (nx: number, ny: number) => {
            const el = spriteRef.current
            if (!el) return 0
            const c = cfg.current
            const r = elegirCelda(nx, ny)

            const col = r.celda % COLS
            const row = (r.celda / COLS) | 0
            el.style.backgroundPosition =
                ((col * 100) / (COLS - 1)).toFixed(4) +
                "% " +
                ((row * 100) / (ROWS - 1)).toFixed(4) +
                "%"
            // el -50% mantiene el sprite centrado en su propio ancho, sea cual
            // sea la proporcion del cuadro; el resto es el gesto de la mirada
            el.style.transform =
                "translateX(calc(-50% + " +
                (r.resX * c.nudgeX).toFixed(2) +
                "px)) rotateX(" +
                (-r.resY * c.nudgeY).toFixed(2) +
                "deg)"

            if (debug) {
                setDbg({
                    nx: Math.round(nx * 100) / 100,
                    ny: Math.round(ny * 100) / 100,
                    radio: r.nombre,
                    celda: r.celda,
                })
            }
            return r.celda
        },
        [elegirCelda, debug]
    )

    const step = useCallback(
        (ts: number) => {
            rafRef.current = null
            const c = cfg.current
            if (!t0.current) t0.current = ts

            const tg = target.current
            const nw = now.current
            nw.x += (tg.x - nw.x) * c.smoothing
            nw.y += (tg.y - nw.y) * c.smoothing

            // respiracion sutil mientras nadie ha movido el cursor
            let bx = 0
            let by = 0
            if (c.idle && !vistoPuntero.current) {
                const t = (ts - t0.current) / 1000
                bx = Math.sin(t * 0.6) * 0.16
                by = Math.sin(t * 0.8 + 1.3) * 0.1
            }

            pintar(clamp(nw.x + bx, -1, 1), clamp(nw.y + by, -1, 1))

            const moviendo =
                Math.abs(tg.x - nw.x) > 0.0015 || Math.abs(tg.y - nw.y) > 0.0015
            if (moviendo || (c.idle && !vistoPuntero.current)) {
                rafRef.current = requestAnimationFrame(step)
            }
        },
        [pintar]
    )

    const schedule = useCallback(() => {
        if (isStatic) return
        if (rafRef.current === null) rafRef.current = requestAnimationFrame(step)
    }, [step, isStatic])

    useEffect(() => {
        if (isStatic) return
        const sinMovimiento =
            typeof matchMedia === "function" &&
            matchMedia("(prefers-reduced-motion: reduce)").matches
        if (sinMovimiento) {
            pintar(0, 0)
            return
        }

        const onMove = (e: PointerEvent) => {
            const root = rootRef.current
            if (!root) return
            const r = root.getBoundingClientRect()
            const cx = r.left + r.width / 2
            const cy = r.top + r.height / 2
            target.current = {
                x: clamp(
                    (e.clientX - cx) / Math.max(1, window.innerWidth * cfg.current.reachX),
                    -1,
                    1
                ),
                y: clamp(
                    (e.clientY - cy) / Math.max(1, window.innerHeight * cfg.current.reachY),
                    -1,
                    1
                ),
            }
            vistoPuntero.current = true
            schedule()
        }
        const onLeave = () => {
            target.current = { x: 0, y: 0 }
            schedule()
        }

        window.addEventListener("pointermove", onMove, { passive: true })
        document.addEventListener("pointerleave", onLeave)
        schedule()
        return () => {
            window.removeEventListener("pointermove", onMove)
            document.removeEventListener("pointerleave", onLeave)
        }
    }, [isStatic, schedule, pintar])

    // al cambiar de atlas hay que repintar: el tamano de fondo cambia de escala
    useEffect(() => {
        pintar(now.current.x, now.current.y)
    }, [atlasActivo, pintar])

    useEffect(
        () => () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        },
        []
    )

    if (!atlasActivo) {
        return (
            <div
                ref={rootRef}
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed #CCC",
                    borderRadius,
                    background: "#F5F5F5",
                    color: "#111",
                    fontSize: 13,
                    textAlign: "center",
                    padding: 12,
                }}
            >
                Asigna atlas-hi.webp, atlas-lo.webp y fondo.webp
            </div>
        )
    }

    const fondoStyle: CSSProperties = {
        position: "absolute",
        inset: 0,
        backgroundImage: srcFondo ? "url(" + srcFondo + ")" : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#1E7FD4",
    }

    /* El sprite se ata a la ALTURA y se fuerza cuadrado, no a un porcentaje del
       ancho. Con el cuadro en 16:9 sale exactamente el recorte original
       (alto x alto = 56.25% del ancho, centrado en el 52.5%), y si alguien
       redimensiona fuera de 16:9 el perro sigue sin deformarse. */
    const spriteStyle: CSSProperties = {
        position: "absolute",
        top: 0,
        left: (CROP_X + CROP_W / 2) * 100 + "%",
        height: "100%",
        aspectRatio: "1 / 1",
        transform: "translateX(-50%)",
        backgroundImage: "url(" + atlasActivo + ")",
        backgroundSize: COLS * 100 + "% " + ROWS * 100 + "%",
        backgroundRepeat: "no-repeat",
        willChange: "background-position, transform",
    }

    return (
        <div
            ref={rootRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                borderRadius,
            }}
        >
            <div style={fondoStyle} />
            <div ref={spriteRef} style={spriteStyle} />
            {debug && (
                <div
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        left: 8,
                        top: 8,
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: "rgba(0,0,0,0.8)",
                        color: "#7ee787",
                        font: "500 11px/1.5 ui-monospace, Menlo, monospace",
                        pointerEvents: "none",
                        whiteSpace: "pre",
                    }}
                >
                    {"GAZESTAR  atlas " +
                        (hiListo ? "alta" : "ligero") +
                        "\nnx " +
                        dbg.nx +
                        "   ny " +
                        dbg.ny +
                        "\nradio " +
                        dbg.radio +
                        "   celda " +
                        dbg.celda}
                </div>
            )}
        </div>
    )
}

addPropertyControls(GazeStar, {
    atlasHi: {
        type: ControlType.Image,
        title: "Atlas alta",
        description: "atlas-hi.webp — se carga solo con raton",
    },
    atlasLo: {
        type: ControlType.Image,
        title: "Atlas ligero",
        description: "atlas-lo.webp — el que se ve al instante",
    },
    fondo: { type: ControlType.Image, title: "Fondo 16:9" },
    atlasHiURL: {
        type: ControlType.String,
        title: "URL alta",
        placeholder: "solo si Framer reescala el atlas",
        defaultValue: "",
    },
    atlasLoURL: {
        type: ControlType.String,
        title: "URL ligero",
        placeholder: "opcional",
        defaultValue: "",
    },
    fondoURL: {
        type: ControlType.String,
        title: "URL fondo",
        placeholder: "opcional",
        defaultValue: "",
    },
    reachX: {
        type: ControlType.Number,
        title: "Alcance X",
        min: 0.1,
        max: 1,
        step: 0.05,
        defaultValue: D.reachX,
        description: "Fraccion de la ventana para llegar al giro maximo",
    },
    reachY: {
        type: ControlType.Number,
        title: "Alcance Y",
        min: 0.1,
        max: 1,
        step: 0.05,
        defaultValue: D.reachY,
    },
    smoothing: {
        type: ControlType.Number,
        title: "Suavizado",
        min: 0.02,
        max: 1,
        step: 0.01,
        defaultValue: D.smoothing,
        description: "Mas bajo = mas lento y suave",
    },
    nudgeX: {
        type: ControlType.Number,
        title: "Gesto X",
        unit: "px",
        min: 0,
        max: 60,
        step: 1,
        defaultValue: D.nudgeX,
        description: "Compensa lo que el radio elegido no cubre",
    },
    nudgeY: {
        type: ControlType.Number,
        title: "Gesto Y",
        unit: "°",
        min: 0,
        max: 40,
        step: 1,
        defaultValue: D.nudgeY,
    },
    deadZone: {
        type: ControlType.Number,
        title: "Zona neutra",
        min: 0,
        max: 0.5,
        step: 0.01,
        defaultValue: D.deadZone,
    },
    idle: {
        type: ControlType.Boolean,
        title: "Respiracion",
        description: "Movimiento sutil hasta que alguien mueve el cursor",
        defaultValue: D.idle,
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Radius",
        unit: "px",
        min: 0,
        max: 400,
        defaultValue: D.borderRadius,
    },
    debug: { type: ControlType.Boolean, title: "Debug", defaultValue: false },
})
