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
 * GazeVideo — el personaje mira hacia donde esta el cursor.
 *
 * POR QUE DOS CAPAS DE VIDEO:
 * currentTime es un solo numero, asi que una linea de tiempo no puede
 * representar una direccion en dos ejes. Recorrerla para ir de una pose a
 * otra obliga a pasar por todos los frames intermedios (el personaje mira
 * abajo mientras gira a un lado). La solucion es tener dos <video> apilados:
 * cada uno se congela en una pose distinta y se mezclan por opacidad. El
 * salto entre poses arbitrarias queda suave y sin frames parasitos.
 *
 * El video NUNCA se reproduce: solo se controla currentTime.
 *
 * IMPORTANTE: el video debe tener todos los frames como keyframe, si no
 * cada salto cuesta decenas de ms:
 *   ffmpeg -i in.mp4 -c:v libx264 -crf 20 -g 1 -keyint_min 1
 *          -x264-params "scenecut=0" -pix_fmt yuv420p -movflags +faststart -an out.mp4
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 400
 * @framerIntrinsicHeight 400
 */

type PoseName = "center" | "up" | "down" | "left" | "right"

interface Props {
    videoFile?: string | { src?: string; url?: string } | null
    tCenter?: number
    tUp?: number
    tDown?: number
    tLeft?: number
    mirrorRight?: boolean
    deadZone?: number
    fadeMs?: number
    tiltX?: number
    tiltY?: number
    reachX?: number
    reachY?: number
    objectFit?: "cover" | "contain" | "fill"
    borderRadius?: number
    debug?: boolean
}

// Tiempos calibrados midiendo el centroide de los ojos frame por frame.
const D = {
    tCenter: 3.2,
    tUp: 1.35,
    tDown: 2.17,
    tLeft: 6.05,
    mirrorRight: false,
    deadZone: 0.22,
    fadeMs: 180,
    tiltX: 14,
    tiltY: 14,
    reachX: 0.5,
    reachY: 0.5,
    objectFit: "contain" as const,
    borderRadius: 0,
    debug: false,
}

// Direcciones deseadas de cada pose. Se elige la de mayor producto punto
// con el vector del cursor: predecible y sin sorpresas.
const DIRS: Array<[PoseName, number, number]> = [
    ["up", 0, -1],
    ["down", 0, 1],
    ["left", -1, 0],
    ["right", 1, 0],
]

function num(v: unknown, fallback: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback
}
function bool(v: unknown, fallback: boolean): boolean {
    return typeof v === "boolean" ? v : fallback
}
function clamp(v: number, min: number, max: number) {
    return v < min ? min : v > max ? max : v
}

function resolveSrc(value: Props["videoFile"]): string {
    if (!value) return ""
    if (typeof value === "string") return value.trim()
    if (typeof value === "object") {
        const c = (value as any).src ?? (value as any).url
        if (typeof c === "string") return c.trim()
    }
    return ""
}

export default function GazeVideo(props: Props) {
    const tCenter = num(props.tCenter, D.tCenter)
    const tUp = num(props.tUp, D.tUp)
    const tDown = num(props.tDown, D.tDown)
    const tLeft = num(props.tLeft, D.tLeft)
    const mirrorRight = bool(props.mirrorRight, D.mirrorRight)
    const deadZone = clamp(num(props.deadZone, D.deadZone), 0, 0.9)
    const fadeMs = num(props.fadeMs, D.fadeMs)
    const tiltX = num(props.tiltX, D.tiltX)
    const tiltY = num(props.tiltY, D.tiltY)
    const reachX = Math.max(0.05, num(props.reachX, D.reachX))
    const reachY = Math.max(0.05, num(props.reachY, D.reachY))
    const objectFit = props.objectFit || D.objectFit
    const borderRadius = num(props.borderRadius, D.borderRadius)
    const debug = bool(props.debug, D.debug)

    const isStatic = useIsStaticRenderer()
    const rootRef = useRef<HTMLDivElement | null>(null)
    const vaRef = useRef<HTMLVideoElement | null>(null)
    const vbRef = useRef<HTMLVideoElement | null>(null)
    const rafRef = useRef<number | null>(null)

    const activeRef = useRef(0) // 0 = A visible, 1 = B visible
    const poseRef = useRef<PoseName>("center")
    const pendingRef = useRef<PoseName | null>(null)
    const busySeekRef = useRef(false)
    const readyRef = useRef(false)

    const tiltTargetRef = useRef({ x: 0, y: 0 })
    const tiltNowRef = useRef({ x: 0, y: 0 })

    const cfg = useRef({
        tCenter,
        tUp,
        tDown,
        tLeft,
        mirrorRight,
        deadZone,
        tiltX,
        tiltY,
    })
    cfg.current = {
        tCenter,
        tUp,
        tDown,
        tLeft,
        mirrorRight,
        deadZone,
        tiltX,
        tiltY,
    }

    const src = useMemo(() => resolveSrc(props.videoFile), [props.videoFile])
    const [dbg, setDbg] = useState({ nx: 0, ny: 0, pose: "center", t: 0 })

    const layers = useCallback(
        () => [vaRef.current, vbRef.current] as const,
        []
    )

    // tiempo y espejo que corresponden a cada pose
    const poseSpec = useCallback((p: PoseName): [number, boolean] => {
        const c = cfg.current
        switch (p) {
            case "up":
                return [c.tUp, false]
            case "down":
                return [c.tDown, false]
            case "left":
                return [c.tLeft, false]
            case "right":
                // El video solo gira hacia la izquierda. Sin espejo no existe
                // una pose de derecha: se queda en el centro.
                return c.mirrorRight ? [c.tLeft, true] : [c.tCenter, false]
            default:
                return [c.tCenter, false]
        }
    }, [])

    const paint = useCallback(() => {
        const [a, b] = layers()
        if (!a || !b) return
        const act = activeRef.current
        a.style.opacity = act === 0 ? "1" : "0"
        b.style.opacity = act === 1 ? "1" : "0"
    }, [layers])

    // Prepara la capa oculta en la nueva pose y recien entonces la revela.
    const runSeek = useCallback(() => {
        const next = pendingRef.current
        if (!next || busySeekRef.current || !readyRef.current) return
        if (next === poseRef.current) {
            pendingRef.current = null
            return
        }
        const idx = 1 - activeRef.current
        const v = layers()[idx]
        if (!v) return

        const [t, mirror] = poseSpec(next)
        busySeekRef.current = true
        v.style.transform = mirror ? "scaleX(-1)" : "none"

        const done = () => {
            v.removeEventListener("seeked", done)
            v.pause()
            activeRef.current = idx
            poseRef.current = next
            paint()
            busySeekRef.current = false
            if (pendingRef.current === next) pendingRef.current = null
            if (pendingRef.current) runSeek()
        }
        v.addEventListener("seeked", done)
        v.pause()
        try {
            v.currentTime = t
        } catch (e) {
            busySeekRef.current = false
        }
    }, [layers, poseSpec, paint])

    const setPose = useCallback(
        (p: PoseName) => {
            if (p === poseRef.current && !pendingRef.current) return
            pendingRef.current = p
            runSeek()
        },
        [runSeek]
    )

    // bucle solo para el desplazamiento CSS
    const step = useCallback(() => {
        rafRef.current = null
        const root = rootRef.current
        if (!root) return
        const c = cfg.current
        const tt = tiltTargetRef.current
        const tn = tiltNowRef.current
        tn.x += (tt.x - tn.x) * 0.14
        tn.y += (tt.y - tn.y) * 0.14
        root.style.transform =
            "translate3d(" +
            (tn.x * c.tiltX).toFixed(2) +
            "px," +
            (tn.y * c.tiltY).toFixed(2) +
            "px,0)"
        if (Math.abs(tt.x - tn.x) > 0.002 || Math.abs(tt.y - tn.y) > 0.002) {
            rafRef.current = requestAnimationFrame(step)
        }
    }, [])

    const schedule = useCallback(() => {
        if (isStatic) return
        if (rafRef.current === null) rafRef.current = requestAnimationFrame(step)
    }, [step, isStatic])

    const pickPose = useCallback((nx: number, ny: number): PoseName => {
        const c = cfg.current
        const m = Math.sqrt(nx * nx + ny * ny)
        if (m < c.deadZone) return "center"
        let best: PoseName = "center"
        let bestDot = -Infinity
        for (const [name, dx, dy] of DIRS) {
            if (name === "right" && !c.mirrorRight) continue
            const dot = (nx * dx + ny * dy) / m
            if (dot > bestDot) {
                bestDot = dot
                best = name
            }
        }
        // Si ninguna pose apunta razonablemente hacia el cursor, centro.
        return bestDot < 0.35 ? "center" : best
    }, [])

    const handlePointer = useCallback(
        (clientX: number, clientY: number) => {
            const root = rootRef.current
            if (!root) return
            const r = root.getBoundingClientRect()
            const cx = r.left + r.width / 2
            const cy = r.top + r.height / 2
            const nx = clamp(
                (clientX - cx) / Math.max(1, window.innerWidth * reachX),
                -1,
                1
            )
            const ny = clamp(
                (clientY - cy) / Math.max(1, window.innerHeight * reachY),
                -1,
                1
            )

            const p = pickPose(nx, ny)
            setPose(p)
            tiltTargetRef.current = { x: nx, y: ny }
            schedule()

            if (debug) {
                const v = layers()[activeRef.current]
                setDbg({
                    nx: Math.round(nx * 100) / 100,
                    ny: Math.round(ny * 100) / 100,
                    pose: p,
                    t: v ? Math.round(v.currentTime * 100) / 100 : 0,
                })
            }
        },
        [reachX, reachY, pickPose, setPose, schedule, debug, layers]
    )

    useEffect(() => {
        if (isStatic) return
        const onMove = (e: PointerEvent) => handlePointer(e.clientX, e.clientY)
        const onLeave = () => {
            setPose("center")
            tiltTargetRef.current = { x: 0, y: 0 }
            schedule()
        }
        window.addEventListener("pointermove", onMove, { passive: true })
        document.addEventListener("pointerleave", onLeave)
        return () => {
            window.removeEventListener("pointermove", onMove)
            document.removeEventListener("pointerleave", onLeave)
        }
    }, [isStatic, handlePointer, setPose, schedule])

    // carga: ambas capas arrancan en la pose centro
    useEffect(() => {
        readyRef.current = false
        activeRef.current = 0
        poseRef.current = "center"
        pendingRef.current = null
        busySeekRef.current = false

        const [a, b] = layers()
        if (!a || !b || !src) return

        let loaded = 0
        const onLoaded = (v: HTMLVideoElement) => () => {
            v.pause()
            try {
                v.currentTime = cfg.current.tCenter
            } catch (e) {
                // noop
            }
            loaded++
            if (loaded >= 2) {
                readyRef.current = true
                paint()
            }
        }
        const ha = onLoaded(a)
        const hb = onLoaded(b)
        a.addEventListener("loadeddata", ha)
        b.addEventListener("loadeddata", hb)
        a.load()
        b.load()
        return () => {
            a.removeEventListener("loadeddata", ha)
            b.removeEventListener("loadeddata", hb)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src])

    useEffect(
        () => () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        },
        []
    )

    useEffect(() => {
        if (!debug || isStatic) return
        const id = window.setInterval(() => {
            const v = layers()[activeRef.current]
            if (!v) return
            setDbg((d) => ({ ...d, t: Math.round(v.currentTime * 100) / 100 }))
        }, 150)
        return () => window.clearInterval(id)
    }, [debug, isStatic, layers])

    if (!src) {
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
                Asigna el video en la propiedad Video file
            </div>
        )
    }

    const layerStyle: CSSProperties = {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit,
        display: "block",
        borderRadius,
        pointerEvents: "none",
        transition: "opacity " + Math.max(0, fadeMs) + "ms linear",
        willChange: "opacity",
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
            <video
                ref={vaRef}
                src={src}
                muted
                playsInline
                preload="auto"
                disableRemotePlayback
                onPlay={(e) => e.currentTarget.pause()}
                style={{ ...layerStyle, opacity: 1 }}
            />
            <video
                ref={vbRef}
                src={src}
                muted
                playsInline
                preload="auto"
                disableRemotePlayback
                onPlay={(e) => e.currentTarget.pause()}
                style={{ ...layerStyle, opacity: 0 }}
            />
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
                        color: "#00ff66",
                        font: "500 11px/1.5 ui-monospace, Menlo, monospace",
                        pointerEvents: "none",
                        whiteSpace: "pre",
                    }}
                >
                    {"CROSSFADE  espejo=" +
                        (mirrorRight ? "SI" : "no") +
                        "\nnx " +
                        dbg.nx +
                        "   ny " +
                        dbg.ny +
                        "\npose " +
                        dbg.pose +
                        "   t " +
                        dbg.t +
                        "s"}
                </div>
            )}
        </div>
    )
}

addPropertyControls(GazeVideo, {
    videoFile: {
        type: ControlType.File,
        title: "Video file",
        allowedFileTypes: ["mp4", "webm", "mov"],
    },
    tCenter: {
        type: ControlType.Number,
        title: "t Centro",
        min: 0,
        max: 60,
        step: 0.01,
        defaultValue: D.tCenter,
    },
    tUp: {
        type: ControlType.Number,
        title: "t Arriba",
        min: 0,
        max: 60,
        step: 0.01,
        defaultValue: D.tUp,
    },
    tDown: {
        type: ControlType.Number,
        title: "t Abajo",
        min: 0,
        max: 60,
        step: 0.01,
        defaultValue: D.tDown,
    },
    tLeft: {
        type: ControlType.Number,
        title: "t Izquierda",
        min: 0,
        max: 60,
        step: 0.01,
        defaultValue: D.tLeft,
    },
    mirrorRight: {
        type: ControlType.Boolean,
        title: "Espejar derecha",
        description: "Off = no hay giro a la derecha (el video no lo tiene)",
        defaultValue: D.mirrorRight,
    },
    deadZone: {
        type: ControlType.Number,
        title: "Zona neutra",
        min: 0,
        max: 0.9,
        step: 0.01,
        defaultValue: D.deadZone,
    },
    fadeMs: {
        type: ControlType.Number,
        title: "Fundido",
        unit: "ms",
        min: 0,
        max: 800,
        step: 10,
        defaultValue: D.fadeMs,
    },
    tiltX: {
        type: ControlType.Number,
        title: "Desplaz. X",
        unit: "px",
        min: 0,
        max: 80,
        step: 1,
        defaultValue: D.tiltX,
    },
    tiltY: {
        type: ControlType.Number,
        title: "Desplaz. Y",
        unit: "px",
        min: 0,
        max: 80,
        step: 1,
        defaultValue: D.tiltY,
    },
    reachX: {
        type: ControlType.Number,
        title: "Alcance X",
        min: 0.1,
        max: 1,
        step: 0.05,
        defaultValue: D.reachX,
    },
    reachY: {
        type: ControlType.Number,
        title: "Alcance Y",
        min: 0.1,
        max: 1,
        step: 0.05,
        defaultValue: D.reachY,
    },
    objectFit: {
        type: ControlType.Enum,
        title: "Fit",
        options: ["contain", "cover", "fill"],
        defaultValue: D.objectFit,
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Radius",
        unit: "px",
        min: 0,
        max: 400,
        defaultValue: D.borderRadius,
    },
    debug: {
        type: ControlType.Boolean,
        title: "Debug",
        defaultValue: true,
    },
})
