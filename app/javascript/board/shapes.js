import { Rect, Ellipse, Line, Path, IText, util } from "fabric"

// Sizes S/M/L per tool.
export const SIZES = {
  pen: { s: 3, m: 6, l: 12 },
  highlighter: { s: 14, m: 22, l: 34 },
  shape: { s: 2, m: 4, l: 7 },
  text: { s: 20, m: 32, l: 56 },
}

export const KEYS = ["uid", "kind"]

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function rgba(hex, alpha) {
  const value = hex.replace("#", "")
  const n = parseInt(value.length === 3 ? value.replace(/./g, "$&$&") : value, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function arrowPath(x1, y1, x2, y2, width) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(12, width * 3.4)
  const a = angle + Math.PI - 0.45
  const b = angle + Math.PI + 0.45
  return `M ${x1} ${y1} L ${x2} ${y2} M ${x2 + head * Math.cos(a)} ${y2 + head * Math.sin(a)} L ${x2} ${y2} L ${x2 + head * Math.cos(b)} ${y2 + head * Math.sin(b)}`
}

export function makeShape(kind, x, y, style) {
  const stroke = style.color
  const strokeWidth = SIZES.shape[style.size]
  const fill = style.fill ? rgba(style.color, 0.18) : "transparent"
  const common = { stroke, strokeWidth, strokeUniform: true, strokeLineCap: "round", strokeLineJoin: "round", objectCaching: false }
  switch (kind) {
    case "rect": return new Rect({ ...common, left: x, top: y, width: 1, height: 1, rx: 8, ry: 8, fill })
    case "ellipse": return new Ellipse({ ...common, left: x, top: y, rx: 1, ry: 1, fill })
    case "line": return new Line([x, y, x, y], { ...common, fill: stroke })
    case "arrow": return new Path(arrowPath(x, y, x + 1, y + 1, strokeWidth), { ...common, fill: "transparent" })
  }
}

// Resize a shape being dragged out from (x0, y0) to (x, y). Arrows are rebuilt (see board controller).
export function dragShape(shape, kind, x0, y0, x, y, shift) {
  let w = x - x0
  let h = y - y0
  if (shift && (kind === "rect" || kind === "ellipse")) {
    const side = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w || 1) * side
    h = Math.sign(h || 1) * side
  }
  const left = Math.min(x0, x0 + w)
  const top = Math.min(y0, y0 + h)
  if (kind === "rect") shape.set({ left, top, width: Math.abs(w), height: Math.abs(h) })
  if (kind === "ellipse") shape.set({ left, top, rx: Math.abs(w) / 2, ry: Math.abs(h) / 2 })
  if (kind === "line") shape.set({ x2: x, y2: y })
  shape.setCoords()
}

export function makeText(x, y, style) {
  return new IText("", {
    left: x, top: y, fontFamily: "Inter, system-ui, sans-serif", fontSize: SIZES.text[style.size], fontWeight: 500,
    fill: style.color, lineHeight: 1.2, editingBorderColor: "#3E63DD", cursorColor: style.color,
  })
}

export function serialize(object) {
  return object.toObject(KEYS)
}

export async function revive(list) {
  return util.enlivenObjects(list)
}

// Selection handles that match the rest of the interface.
export function decorate(object) {
  object.set({
    borderColor: "#3E63DD", cornerColor: "#ffffff", cornerStrokeColor: "#3E63DD", cornerStyle: "circle",
    transparentCorners: false, cornerSize: 10, padding: 4, borderScaleFactor: 1.5,
    perPixelTargetFind: object.kind === "path" || object.kind === "line" || object.kind === "arrow",
  })
  return object
}
