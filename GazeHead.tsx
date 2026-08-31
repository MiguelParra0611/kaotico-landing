import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
} from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

/**
 * GazeHead — una imagen que sigue al cursor girando en 3D.
 *
 * Sin video: una sola imagen con transformaciones CSS. Sigue al cursor de
 * forma exacta y continua en los DOS ejes, a 60fps, sin decodificar nada.
 * Es la tecnica con la que se construyen estos efectos en landings reales.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 420
 * @framerIntrinsicHeight 400
 */

interface Props {
    image?: string | { src?: string } | null
    rotateY?: number
    rotateX?: number
    shiftX?: number
    shiftY?: number
    perspective?: number
    smoothing?: number
    reachX?: number
    reachY?: number
    idle?: boolean
    objectFit?: "contain" | "cover"
    debug?: boolean
}

const D = {
    rotateY: 20,
    rotateX: 13,
    shiftX: 16,
    shiftY: 12,
    perspective: 900,
    smoothing: 0.12,
    reachX: 0.55,
    reachY: 0.55,
    idle: true,
    objectFit: "contain" as const,
    debug: false,
}

function num(v: unknown, f: number) {
    return typeof v === "number" && Number.isFinite(v) ? v : f
}
function bool(v: unknown, f: boolean) {
    return typeof v === "boolean" ? v : f
}
function clamp(v: number, a: number, b: number) {
    return v < a ? a : v > b ? b : v
}
function resolveSrc(v: Props["image"]): string {
    if (!v) return ""
    if (typeof v === "string") return v.trim()
    if (typeof v === "object" && typeof (v as any).src === "string")
        return (v as any).src.trim()
    return ""
}

export default function GazeHead(props: Props) {
    const rotY = num(props.rotateY, D.rotateY)
    const rotX = num(props.rotateX, D.rotateX)
    const shiftX = num(props.shiftX, D.shiftX)
    const shiftY = num(props.shiftY, D.shiftY)
    const perspective = num(props.perspective, D.perspective)
    const smoothing = clamp(num(props.smoothing, D.smoothing), 0.02, 1)
    const reachX = Math.max(0.05, num(props.reachX, D.reachX))
    const reachY = Math.max(0.05, num(props.reachY, D.reachY))
    const idle = bool(props.idle, D.idle)
    const objectFit = props.objectFit || D.objectFit
    const debug = bool(props.debug, D.debug)

    const isStatic = useIsStaticRenderer()
    const rootRef = useRef<HTMLDivElement | null>(null)
    const innerRef = useRef<HTMLDivElement | null>(null)
    const rafRef = useRef<number | null>(null)

    const targetRef = useRef({ x: 0, y: 0 })
    const nowRef = useRef({ x: 0, y: 0 })
    const seenPointerRef = useRef(false)
    const t0Ref = useRef(0)

    const cfg = useRef({ rotY, rotX, shiftX, shiftY, smoothing, idle })
    cfg.current = { rotY, rotX, shiftX, shiftY, smoothing, idle }

    const src = resolveSrc(props.image)
    const [dbg, setDbg] = useState({ x: 0, y: 0 })

    const step = useCallback((ts: number) => {
        rafRef.current = null
        const el = innerRef.current
        if (!el) return
        const c = cfg.current
        if (!t0Ref.current) t0Ref.current = ts

        const tg = targetRef.current
        const nw = nowRef.current
        nw.x += (tg.x - nw.x) * c.smoothing
        nw.y += (tg.y - nw.y) * c.smoothing

        // respiracion sutil mientras nadie ha movido el cursor
        let bx = 0
        let by = 0
        if (c.idle && !seenPointerRef.current) {
            const t = (ts - t0Ref.current) / 1000
            bx = Math.sin(t * 0.7) * 0.12
            by = Math.sin(t * 0.9 + 1.3) * 0.08
        }

        const x = nw.x + bx
        const y = nw.y + by

        el.style.transform =
            "translate3d(" +
            (x * c.shiftX).toFixed(2) +
            "px," +
            (y * c.shiftY).toFixed(2) +
            "px,0) rotateY(" +
            (x * c.rotY).toFixed(2) +
            "deg) rotateX(" +
            (-y * c.rotX).toFixed(2) +
            "deg)"

        const moving =
            Math.abs(tg.x - nw.x) > 0.0015 || Math.abs(tg.y - nw.y) > 0.0015
        if (moving || (c.idle && !seenPointerRef.current)) {
            rafRef.current = requestAnimationFrame(step)
        }
    }, [])

    const schedule = useCallback(() => {
        if (isStatic) return
        if (rafRef.current === null) rafRef.current = requestAnimationFrame(step)
    }, [step, isStatic])

    useEffect(() => {
        if (isStatic) return
        const onMove = (e: PointerEvent) => {
            const root = rootRef.current
            if (!root) return
            const r = root.getBoundingClientRect()
            const cx = r.left + r.width / 2
            const cy = r.top + r.height / 2
            const x = clamp(
                (e.clientX - cx) / Math.max(1, window.innerWidth * reachX),
                -1,
                1
            )
            const y = clamp(
                (e.clientY - cy) / Math.max(1, window.innerHeight * reachY),
                -1,
                1
            )
            targetRef.current = { x, y }
            seenPointerRef.current = true
            schedule()
            if (debug)
                setDbg({
                    x: Math.round(x * 100) / 100,
                    y: Math.round(y * 100) / 100,
                })
        }
        const onLeave = () => {
            targetRef.current = { x: 0, y: 0 }
            schedule()
        }
        window.addEventListener("pointermove", onMove, { passive: true })
        document.addEventListener("pointerleave", onLeave)
        schedule()
        return () => {
            window.removeEventListener("pointermove", onMove)
            document.removeEventListener("pointerleave", onLeave)
        }
    }, [isStatic, reachX, reachY, schedule, debug])

    useEffect(
        () => () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        },
        []
    )

    const wrapStyle: CSSProperties = {
        position: "relative",
        width: "100%",
        height: "100%",
        perspective: perspective + "px",
        perspectiveOrigin: "50% 45%",
    }

    if (!src) {
        return (
            <div
                ref={rootRef}
                style={{
                    ...wrapStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed #CCC",
                    background: "#F5F5F5",
                    color: "#111",
                    fontSize: 13,
                    textAlign: "center",
                    padding: 12,
                }}
            >
                Asigna la imagen en la propiedad Imagen
            </div>
        )
    }

    return (
        <div ref={rootRef} style={wrapStyle}>
            <div
                ref={innerRef}
                style={{
                    width: "100%",
                    height: "100%",
                    transformStyle: "preserve-3d",
                    willChange: "transform",
                }}
            >
                <img
                    src={src}
                    alt=""
                    draggable={false}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit,
                        display: "block",
                        userSelect: "none",
                        pointerEvents: "none",
                    }}
                />
            </div>
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
                    {"GAZEHEAD\nx " + dbg.x + "   y " + dbg.y}
                </div>
            )}
        </div>
    )
}

addPropertyControls(GazeHead, {
    image: {
        type: ControlType.Image,
        title: "Imagen",
    },
    rotateY: {
        type: ControlType.Number,
        title: "Giro lateral",
        unit: "°",
        min: 0,
        max: 60,
        step: 1,
        defaultValue: D.rotateY,
    },
    rotateX: {
        type: ControlType.Number,
        title: "Giro vertical",
        unit: "°",
        min: 0,
        max: 60,
        step: 1,
        defaultValue: D.rotateX,
    },
    shiftX: {
        type: ControlType.Number,
        title: "Desplaz. X",
        unit: "px",
        min: 0,
        max: 120,
        step: 1,
        defaultValue: D.shiftX,
    },
    shiftY: {
        type: ControlType.Number,
        title: "Desplaz. Y",
        unit: "px",
        min: 0,
        max: 120,
        step: 1,
        defaultValue: D.shiftY,
    },
    perspective: {
        type: ControlType.Number,
        title: "Perspectiva",
        unit: "px",
        min: 200,
        max: 3000,
        step: 50,
        defaultValue: D.perspective,
    },
    smoothing: {
        type: ControlType.Number,
        title: "Suavizado",
        description: "Mas bajo = mas lento y suave",
        min: 0.02,
        max: 1,
        step: 0.01,
        defaultValue: D.smoothing,
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
    idle: {
        type: ControlType.Boolean,
        title: "Respiracion",
        description: "Movimiento sutil hasta que alguien mueve el cursor",
        defaultValue: D.idle,
    },
    objectFit: {
        type: ControlType.Enum,
        title: "Fit",
        options: ["contain", "cover"],
        defaultValue: D.objectFit,
    },
    debug: {
        type: ControlType.Boolean,
        title: "Debug",
        defaultValue: false,
    },
})
