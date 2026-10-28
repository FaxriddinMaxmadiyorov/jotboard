import { Controller } from "@hotwired/stimulus"
import { Canvas, PencilBrush, Point, Path, ActiveSelection } from "fabric"
import { createConsumer } from "@rails/actioncable"
import { SIZES, uid, rgba, arrowPath, makeShape, dragShape, makeText, serialize, revive, decorate } from "board/shapes"
import { avatarHTML, escapeHTML, toast, request, roleLabel } from "board/ui"

const DRAW_TOOLS = ["pen", "highlighter", "eraser", "line", "arrow", "rect", "ellipse", "text"]
const SHAPE_TOOLS = ["line", "arrow", "rect", "ellipse"]
const TOOL_KEYS = { v: "select", h: "hand", p: "pen", m: "highlighter", e: "eraser", l: "line", a: "arrow", r: "rect", o: "ellipse", t: "text" }
const RANK = { viewer: 0, artist: 1, editor: 2, manager: 3 }
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const HISTORY_LIMIT = 200
const CURSOR_SVG = `<svg width="18" height="20" viewBox="0 0 18 20"><path d="M1.5 1.5 16 9.2l-6.6 1.7-3.1 6.6z" fill="var(--cursor)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`

// One board: the Fabric canvas, the live connection, pages, people and every tool.
export default class extends Controller {
  static values = { config: Object }
  static targets = [
    "stage", "canvas", "cursors", "boardName", "pageLabel", "status", "presence", "toolbar", "undo", "redo",
    "stylebar", "fill", "fillSep", "deleteButton", "deleteSep", "pagesbar", "pageList", "zoomLabel", "viewOnly",
    "peoplePanel", "defaultRole", "memberList",
  ]

  // --- lifecycle --------------------------------------------------------------------------------

  connect() {
    const config = this.configValue
    this.me = config.me
    this.urls = config.urls
    this.pages = config.pages
    this.members = new Map(config.members.map((m) => [m.uid, m]))
    this.online = []
    this.cid = uid().slice(0, 12)
    this.cursors = new Map()
    this.history = []
    this.future = []
    this.queue = null
    this.tool = "select"
    this.style = { color: "#111318", size: "m", fill: false }

    this.setupCanvas()
    this.defaultRoleTarget.value = config.defaultRole
    this.applyRole(this.me.role)
    this.renderPages()
    this.renderMembers()
    this.pickToolByName(this.canDraw ? "pen" : "select")

    const fromHash = Number(new URLSearchParams(location.hash.slice(1)).get("page"))
    const start = this.pages.find((p) => p.id === fromHash) || this.pages[0]
    this.loadPage(start.id)

    this.consumer = createConsumer()
    this.subscription = this.consumer.subscriptions.create(
      { channel: "BoardChannel", board: config.slug, cid: this.cid },
      {
        connected: () => this.onConnected(),
        disconnected: () => this.setStatus("Reconnecting…"),
        rejected: () => this.setStatus("Cannot connect"),
        received: (data) => this.receive(data),
      },
    )

    this.onKeyDown = this.keyDown.bind(this)
    this.onKeyUp = this.keyUp.bind(this)
    window.addEventListener("keydown", this.onKeyDown)
    window.addEventListener("keyup", this.onKeyUp)
    this.idleTimer = setInterval(() => this.hideIdleCursors(), 1000)
  }

  disconnect() {
    window.removeEventListener("keydown", this.onKeyDown)
    window.removeEventListener("keyup", this.onKeyUp)
    clearInterval(this.idleTimer)
    clearTimeout(this.thumbTimer)
    this.resizeObserver?.disconnect()
    this.subscription?.unsubscribe()
    this.consumer?.disconnect()
    this.canvas?.dispose()
  }

  // --- canvas -----------------------------------------------------------------------------------

  setupCanvas() {
    const canvas = new Canvas(this.canvasTarget, {
      preserveObjectStacking: true,
      targetFindTolerance: 6,
      selectionColor: "rgba(62, 99, 221, 0.08)",
      selectionBorderColor: "#3E63DD",
      selectionLineWidth: 1,
      fireMiddleClick: true,
      stopContextMenu: true,
      enablePointerEvents: true,
    })
    this.canvas = canvas
    canvas.freeDrawingBrush = new PencilBrush(canvas)
    canvas.freeDrawingBrush.decimate = 1.5

    const fit = () => {
      const { width, height } = this.stageTarget.getBoundingClientRect()
      canvas.setDimensions({ width, height })
      this.afterViewport()
    }
    this.resizeObserver = new ResizeObserver(fit)
    this.resizeObserver.observe(this.stageTarget)
    fit()

    canvas.on("mouse:down", (o) => this.pointerDown(o))
    canvas.on("mouse:move", (o) => this.pointerMove(o))
    canvas.on("mouse:up", (o) => this.pointerUp(o))
    canvas.on("mouse:wheel", (o) => this.wheel(o))
    canvas.on("path:created", ({ path }) => this.pathCreated(path))
    canvas.on("object:modified", ({ target }) => this.objectsModified(target))
    canvas.on("text:changed", ({ target }) => this.textChanged(target))
    canvas.on("text:editing:exited", ({ target }) => this.textExited(target))
    canvas.on("selection:created", () => this.selectionChanged())
    canvas.on("selection:updated", () => this.selectionChanged())
    canvas.on("selection:cleared", () => this.selectionChanged())
  }

  get canDraw() { return RANK[this.me.role] >= RANK.artist }
  get canPages() { return RANK[this.me.role] >= RANK.editor }
  get canManage() { return RANK[this.me.role] >= RANK.manager }
  get page() { return this.pages.find((p) => p.id === this.pageId) }

  objects() { return this.canvas.getObjects() }
  findObject(id) { return this.objects().find((o) => o.uid === id) }

  // Objects sit in the canvas in z order. New local objects have no z until the server echo arrives
  // and count as topmost.
  insertByZ(object) {
    const list = this.objects()
    const z = object.z ?? Infinity
    const index = list.findIndex((o) => (o.z ?? Infinity) > z)
    if (index === -1) this.canvas.add(object)
    else this.canvas.insertAt(index, object)
  }

  prepare(object, z) {
    decorate(object)
    object.z = z
    const editable = this.canDraw && this.tool === "select"
    object.set({ selectable: editable, evented: editable || this.tool === "eraser" })
    return object
  }

  // --- tools ------------------------------------------------------------------------------------

  pickTool(event) {
    this.pickToolByName(event.currentTarget.dataset.tool)
  }

  pickToolByName(tool) {
    if (DRAW_TOOLS.includes(tool) && !this.canDraw) return
    const canvas = this.canvas
    if (this.editingText()) this.editingText().exitEditing()
    if (tool !== "select") canvas.discardActiveObject()
    this.tool = tool
    this.element.dataset.tool = tool
    this.toolbarTarget.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("is-active", b.dataset.tool === tool))

    const select = tool === "select"
    canvas.isDrawingMode = tool === "pen" || tool === "highlighter"
    canvas.selection = select && this.canDraw
    canvas.skipTargetFind = !(select || tool === "eraser")
    canvas.defaultCursor = tool === "hand" ? "grab" : select ? "default" : "crosshair"
    canvas.hoverCursor = select && this.canDraw ? "move" : canvas.defaultCursor
    this.objects().forEach((o) => o.set({ selectable: select && this.canDraw, evented: (select && this.canDraw) || tool === "eraser" }))
    this.updateBrush()
    this.updateStylebar()
    canvas.requestRenderAll()
  }

  updateBrush() {
    const brush = this.canvas.freeDrawingBrush
    if (this.tool === "highlighter") {
      brush.color = rgba(this.style.color, 0.35)
      brush.width = SIZES.highlighter[this.style.size]
      brush.strokeLineCap = "butt"
    } else {
      brush.color = this.style.color
      brush.width = SIZES.pen[this.style.size]
      brush.strokeLineCap = "round"
    }
  }

  pickColor(event) {
    this.style.color = event.currentTarget.dataset.color
    this.applyStyleToSelection({ color: true })
    this.updateBrush()
    this.updateStylebar()
  }

  pickSize(event) {
    this.style.size = event.currentTarget.dataset.size
    this.applyStyleToSelection({ size: true })
    this.updateBrush()
    this.updateStylebar()
  }

  toggleFill() {
    this.style.fill = !this.style.fill
    this.applyStyleToSelection({ fill: true })
    this.updateStylebar()
  }

  applyStyleToSelection(what) {
    const selected = this.canvas.getActiveObjects()
    if (!selected.length || !this.canDraw) return
    const { color, size, fill } = this.style
    selected.forEach((o) => {
      if (what.color) {
        if (o.kind === "text") o.set({ fill: color })
        else if (o.kind === "path" && o.globalCompositeOperation === "multiply") o.set({ stroke: rgba(color, 0.35) })
        else o.set({ stroke: color })
        if (o.kind === "line") o.set({ fill: color })
        if ((o.kind === "rect" || o.kind === "ellipse") && o.fill !== "transparent") o.set({ fill: rgba(color, 0.18) })
      }
      if (what.size) {
        if (o.kind === "text") o.set({ fontSize: SIZES.text[size] })
        else if (o.kind === "path") o.set({ strokeWidth: (o.globalCompositeOperation === "multiply" ? SIZES.highlighter : SIZES.pen)[size] })
        else o.set({ strokeWidth: SIZES.shape[size] })
      }
      if (what.fill && (o.kind === "rect" || o.kind === "ellipse")) o.set({ fill: fill ? rgba(o.stroke, 0.18) : "transparent" })
      o.setCoords()
    })
    this.canvas.requestRenderAll()
    this.commitUpdate(selected)
  }

  // The style bar follows the selection when there is one, the active tool otherwise.
  updateStylebar() {
    const selected = this.canvas?.getActiveObjects() || []
    const styled = selected.length > 0 || ["pen", "highlighter", "line", "arrow", "rect", "ellipse", "text"].includes(this.tool)
    this.stylebarTarget.hidden = !(this.canDraw && styled)
    const fillable = selected.length ? selected.some((o) => o.kind === "rect" || o.kind === "ellipse") : ["rect", "ellipse"].includes(this.tool)
    this.fillTarget.hidden = this.fillSepTarget.hidden = !fillable
    this.deleteButtonTarget.hidden = this.deleteSepTarget.hidden = selected.length === 0
    this.stylebarTarget.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("is-active", b.dataset.color === this.style.color))
    this.stylebarTarget.querySelectorAll("[data-size]").forEach((b) => b.classList.toggle("is-active", b.dataset.size === this.style.size))
    this.fillTarget.classList.toggle("is-active", this.style.fill)
    this.fillTarget.style.setProperty("--fill", this.style.color)
  }

  selectionChanged() {
    const selected = this.canvas.getActiveObjects()
    if (selected.length === 1) {
      const o = selected[0]
      const color = o.kind === "text" ? o.fill : o.stroke
      if (typeof color === "string" && color.startsWith("#")) this.style.color = color.toUpperCase()
      if (o.kind === "rect" || o.kind === "ellipse") this.style.fill = o.fill !== "transparent"
    }
    this.updateStylebar()
  }

  // --- pointer ----------------------------------------------------------------------------------

  pointerDown(o) {
    const e = o.e
    const point = this.canvas.getScenePoint(e)
    if (this.spaceDown || this.tool === "hand" || e.button === 1) return this.startPan(e)
    if (this.tool === "select" && !this.canDraw) return this.startPan(e)

    if (this.tool === "eraser") {
      this.erasing = new Set()
      this.eraseAt(e)
      return
    }
    if (SHAPE_TOOLS.includes(this.tool)) {
      const shape = makeShape(this.tool, point.x, point.y, this.style)
      shape.uid = uid()
      shape.kind = this.tool
      this.prepare(shape, undefined)
      shape.set({ selectable: false, evented: false })
      this.canvas.add(shape)
      this.drag = { shape, x0: point.x, y0: point.y }
      return
    }
    if (this.tool === "text") {
      // The click that ends editing does not also start a new text.
      if (this.editingText() || performance.now() - (this.textExitedAt || 0) < 120) return
      const hit = this.objects().slice().reverse().find((obj) => obj.kind === "text" && obj.containsPoint(point))
      if (hit) return this.editText(hit)
      this.startText(point)
    }
  }

  pointerMove(o) {
    const e = o.e
    const point = this.canvas.getScenePoint(e)
    this.sendCursor(point)
    if (this.pan) return this.movePan(e)
    if (this.erasing) return this.eraseAt(e)
    if (this.drag) {
      const { shape, x0, y0 } = this.drag
      if (shape.kind === "arrow") {
        this.drag.shape = this.rebuildArrow(shape, x0, y0, point.x, point.y)
      } else {
        dragShape(shape, shape.kind, x0, y0, point.x, point.y, e.shiftKey)
      }
      this.canvas.requestRenderAll()
    }
  }

  pointerUp() {
    if (this.pan) return this.endPan()
    if (this.erasing) {
      const gone = [...this.erasing]
      this.erasing = null
      if (gone.length) {
        gone.forEach((obj) => this.canvas.remove(obj))
        this.commitRemove(gone)
      }
      return
    }
    if (this.drag) {
      const { shape } = this.drag
      this.drag = null
      const box = shape.getBoundingRect()
      if (box.width < 4 && box.height < 4) {
        this.canvas.remove(shape)
        return
      }
      shape.setCoords()
      this.commitAdd(shape)
    }
  }

  rebuildArrow(old, x0, y0, x, y) {
    const arrow = new Path(arrowPath(x0, y0, x, y, old.strokeWidth), {
      stroke: old.stroke, strokeWidth: old.strokeWidth, strokeUniform: true, strokeLineCap: "round",
      strokeLineJoin: "round", fill: "transparent", objectCaching: false,
    })
    arrow.uid = old.uid
    arrow.kind = "arrow"
    this.prepare(arrow, undefined)
    arrow.set({ selectable: false, evented: false })
    const index = this.objects().indexOf(old)
    this.canvas.remove(old)
    this.canvas.insertAt(index, arrow)
    return arrow
  }

  eraseAt(e) {
    const target = this.canvas.findTarget(e)
    if (target && !this.erasing.has(target) && target.uid) {
      this.erasing.add(target)
      target.set({ opacity: 0.2 })
      this.canvas.requestRenderAll()
    }
  }

  pathCreated(path) {
    path.uid = uid()
    path.kind = "path"
    if (this.tool === "highlighter") path.set({ globalCompositeOperation: "multiply" })
    path.set({ objectCaching: true })
    this.prepare(path, undefined)
    this.commitAdd(path)
  }

  // --- text -------------------------------------------------------------------------------------

  startText(point) {
    const text = makeText(point.x, point.y - SIZES.text[this.style.size] * 0.6, this.style)
    text.uid = uid()
    text.kind = "text"
    this.prepare(text, undefined)
    text.set({ selectable: true, evented: true })
    this.canvas.add(text)
    this.canvas.setActiveObject(text)
    text.enterEditing()
    text.hiddenTextarea?.focus()
  }

  editText(text) {
    text.set({ selectable: true, evented: true })
    this.canvas.setActiveObject(text)
    text.enterEditing()
    text.selectAll()
    this.canvas.requestRenderAll()
  }

  editingText() {
    const active = this.canvas?.getActiveObject()
    return active?.isEditing ? active : null
  }

  textChanged(text) {
    clearTimeout(text._commitTimer)
    text._commitTimer = setTimeout(() => this.commitText(text), 250)
  }

  commitText(text) {
    if (!text.text.trim()) return
    if (text._saved) this.commitUpdate([text])
    else this.commitAdd(text)
  }

  textExited(text) {
    clearTimeout(text._commitTimer)
    this.textExitedAt = performance.now()
    if (!text.text.trim()) {
      this.canvas.remove(text)
      if (text._saved) this.commitRemove([text])
      return
    }
    this.commitText(text)
    if (this.tool !== "select") {
      text.set({ selectable: false, evented: this.tool === "eraser" })
      this.canvas.discardActiveObject()
      this.canvas.requestRenderAll()
    }
  }

  // --- local changes ----------------------------------------------------------------------------

  perform(action, payload) {
    this.subscription.perform(action, { page_id: this.pageId, ...payload })
  }

  commitAdd(object, { record = true } = {}) {
    const data = serialize(object)
    if (this.tooBig(data)) {
      this.canvas.remove(object)
      return
    }
    object._saved = data
    this.perform("add", { uid: object.uid, kind: object.kind, data })
    if (record) this.record({ type: "add", items: [{ uid: object.uid, data }] })
    this.scheduleThumbnail()
  }

  // Objects inside a multi-selection have coordinates relative to the selection, so the selection
  // is dissolved while they are serialized and restored afterwards.
  commitUpdate(objects) {
    const active = this.canvas.getActiveObject()
    const regroup = active instanceof ActiveSelection
    if (regroup) this.canvas.discardActiveObject()

    const items = []
    objects.forEach((o) => {
      if (!o._saved) return
      const after = serialize(o)
      if (JSON.stringify(after) === JSON.stringify(o._saved) || this.tooBig(after)) return
      items.push({ uid: o.uid, before: o._saved, after })
      o._saved = after
      this.perform("update", { uid: o.uid, data: after })
    })

    if (regroup) {
      const alive = objects.filter((o) => this.objects().includes(o))
      if (alive.length > 1) this.canvas.setActiveObject(new ActiveSelection(alive, { canvas: this.canvas }))
    }
    if (items.length) {
      this.record({ type: "update", items })
      this.scheduleThumbnail()
    }
  }

  commitRemove(objects) {
    const items = objects.filter((o) => o._saved).map((o) => ({ uid: o.uid, data: o._saved }))
    if (!items.length) return
    this.perform("remove", { uids: items.map((i) => i.uid) })
    this.record({ type: "remove", items })
    this.scheduleThumbnail()
  }

  objectsModified(target) {
    const objects = target instanceof ActiveSelection ? target.getObjects() : [target]
    this.commitUpdate(objects)
  }

  deleteSelection() {
    if (!this.canDraw) return
    const selected = this.canvas.getActiveObjects()
    if (!selected.length) return
    this.canvas.discardActiveObject()
    selected.forEach((o) => this.canvas.remove(o))
    this.commitRemove(selected)
    this.canvas.requestRenderAll()
  }

  tooBig(data) {
    if (JSON.stringify(data).length < 190_000) return false
    toast("That stroke is too large to save. Try a shorter one.")
    return true
  }

  // --- undo and redo ----------------------------------------------------------------------------

  record(entry) {
    entry.pageId = this.pageId
    this.history.push(entry)
    if (this.history.length > HISTORY_LIMIT) this.history.shift()
    this.future = []
    this.updateHistoryButtons()
  }

  updateHistoryButtons() {
    const here = (list) => list.some((e) => e.pageId === this.pageId)
    this.undoTarget.disabled = !here(this.history)
    this.redoTarget.disabled = !here(this.future)
  }

  async undo() { await this.travel(this.history, this.future, true) }
  async redo() { await this.travel(this.future, this.history, false) }

  async travel(from, to, backwards) {
    if (!this.canDraw) return
    const index = from.findLastIndex((e) => e.pageId === this.pageId)
    if (index === -1) return
    const [entry] = from.splice(index, 1)
    to.push(entry)
    this.canvas.discardActiveObject()

    const removeAll = (items) => {
      const objects = items.map((i) => this.findObject(i.uid)).filter(Boolean)
      objects.forEach((o) => this.canvas.remove(o))
      if (objects.length) this.perform("remove", { uids: objects.map((o) => o.uid) })
    }
    const addAll = async (items) => {
      const objects = await revive(items.map((i) => i.data))
      objects.forEach((o) => {
        if (this.findObject(o.uid)) return
        this.prepare(o, undefined)
        this.canvas.add(o)
        this.commitAdd(o, { record: false })
      })
    }
    const setAll = async (items, key) => {
      for (const item of items) {
        const current = this.findObject(item.uid)
        if (!current) continue
        const [fresh] = await revive([item[key]])
        this.replaceObject(current, fresh, current.z)
        fresh._saved = item[key]
        this.perform("update", { uid: item.uid, data: item[key] })
      }
    }

    if (entry.type === "add") backwards ? removeAll(entry.items) : await addAll(entry.items)
    if (entry.type === "remove") backwards ? await addAll(entry.items) : removeAll(entry.items)
    if (entry.type === "update") await setAll(entry.items, backwards ? "before" : "after")

    this.canvas.requestRenderAll()
    this.updateHistoryButtons()
    this.scheduleThumbnail()
  }

  replaceObject(old, fresh, z) {
    const index = this.objects().indexOf(old)
    this.prepare(fresh, z)
    this.canvas.remove(old)
    if (index === -1) this.insertByZ(fresh)
    else this.canvas.insertAt(index, fresh)
  }

  // --- live updates from others -----------------------------------------------------------------

  onConnected() {
    const wasOffline = this.offline
    this.offline = false
    this.setStatus(null)
    if (wasOffline && this.pageId) this.loadPage(this.pageId, { keepView: true })
    this.offlineArmed = true
  }

  setStatus(text) {
    if (text && this.offlineArmed) this.offline = true
    this.statusTarget.hidden = !text
    this.statusTarget.textContent = text || ""
  }

  receive(data) {
    const mine = data.cid === this.cid
    switch (data.type) {
      case "element.added":
      case "element.updated":
      case "element.removed":
      case "page.cleared":
        if (data.page_id !== this.pageId) return
        if (this.queue) return this.queue.push(data)
        return this.applyRemote(data, mine)
      case "cursor":
        if (!mine) this.moveCursor(data)
        return
      case "presence":
        this.online = data.people
        this.renderPresence()
        this.renderMembers()
        this.dropGoneCursors()
        return
      case "member":
        this.members.set(data.member.uid, data.member)
        if (data.member.uid === this.me.uid) this.applyRole(data.member.role)
        this.renderMembers()
        return
      case "pages":
        return this.pagesChanged(data, mine)
      case "thumbnail": {
        const page = this.pages.find((p) => p.id === data.page_id)
        if (page) page.thumbnail_version = data.version
        this.renderPages()
        return
      }
      case "board":
        if (document.activeElement !== this.boardNameTarget) this.boardNameTarget.value = data.board.name
        document.title = `${data.board.name} · Jotboard`
        this.defaultRoleTarget.value = data.board.link_role
        return
      case "board.deleted":
        if (data.by?.uid !== this.me.uid) toast(`${data.by?.nickname || "The owner"} deleted this board.`)
        setTimeout(() => window.location.assign(this.urls.home), 1200)
        return
      case "error":
        toast(data.message)
    }
  }

  async applyRemote(data, mine) {
    if (data.type === "page.cleared") {
      this.canvas.discardActiveObject()
      this.canvas.remove(...this.objects())
      return
    }
    if (data.type === "element.removed") {
      const gone = new Set(data.uids)
      const objects = this.objects().filter((o) => gone.has(o.uid))
      if (objects.some((o) => this.canvas.getActiveObjects().includes(o))) this.canvas.discardActiveObject()
      this.canvas.remove(...objects)
      return
    }

    const element = data.element
    const existing = this.findObject(element.uid)
    if (mine) {
      // Our own change coming back: just learn the z the server gave it.
      if (existing && existing.z === undefined) existing.z = element.z
      return
    }
    const [fresh] = await revive([element.data])
    const current = this.findObject(element.uid)
    if (current) {
      if (this.canvas.getActiveObjects().includes(current)) this.canvas.discardActiveObject()
      this.replaceObject(current, fresh, element.z)
    } else {
      this.prepare(fresh, element.z)
      this.insertByZ(fresh)
    }
    fresh._saved = element.data
    this.canvas.requestRenderAll()
  }

  // --- pages ------------------------------------------------------------------------------------

  async loadPage(pageId, { keepView = false } = {}) {
    this.flushThumbnail()
    this.pageId = pageId
    this.queue = []
    history.replaceState(null, "", `#page=${pageId}`)
    this.renderPages()
    this.updateHistoryButtons()
    this.cursors.forEach((c) => c.el.classList.add("is-idle"))

    this.canvas.discardActiveObject()
    this.canvas.remove(...this.objects())
    let elements = []
    try {
      const response = await request(this.urls.elements.replace(":id", pageId))
      elements = (await response.json()).elements
    } catch {
      toast("Could not load this page. Check your connection.")
    }
    if (this.pageId !== pageId) return

    elements.sort((a, b) => a.z - b.z)
    const objects = await revive(elements.map((e) => e.data))
    if (this.pageId !== pageId) return
    this.canvas.remove(...this.objects())
    objects.forEach((o, i) => {
      this.prepare(o, elements[i].z)
      o._saved = elements[i].data
    })
    if (objects.length) this.canvas.add(...objects)

    const queued = this.queue
    this.queue = null
    for (const event of queued) await this.applyRemote(event, event.cid === this.cid)

    if (!keepView) {
      if (objects.length) this.zoomFit({ maxZoom: 1 })
      else this.setViewport(1, 0, 0)
    }
    this.canvas.requestRenderAll()
  }

  switchPage(event) {
    const id = Number(event.currentTarget.dataset.pageId)
    if (id !== this.pageId) this.loadPage(id)
  }

  addPage() {
    if (!this.canPages) return
    this.subscription.perform("add_page", {})
  }

  renamePage(event) {
    event.stopPropagation()
    if (!this.canPages) return
    const page = this.pages.find((p) => p.id === Number(event.currentTarget.closest("[data-page-id]").dataset.pageId))
    const label = event.currentTarget.closest("[data-page-id]").querySelector(".page-thumb__label")
    const input = document.createElement("input")
    input.className = "page-thumb__rename"
    input.value = page.name
    input.maxLength = 60
    label.replaceChildren(input)
    input.focus()
    input.select()
    const done = (save) => {
      if (save && input.value.trim() && input.value.trim() !== page.name) this.perform("rename_page", { page_id: page.id, name: input.value.trim() })
      this.renderPages()
    }
    input.addEventListener("keydown", (e) => {
      e.stopPropagation()
      if (e.key === "Enter") done(true)
      if (e.key === "Escape") done(false)
    })
    input.addEventListener("blur", () => done(true), { once: true })
    input.addEventListener("click", (e) => e.stopPropagation())
  }

  removePage(event) {
    event.stopPropagation()
    if (!this.canPages || this.pages.length < 2) return
    const id = Number(event.currentTarget.closest("[data-page-id]").dataset.pageId)
    const page = this.pages.find((p) => p.id === id)
    if (!confirm(`Delete "${page.name}" and everything on it for everyone?`)) return
    this.subscription.perform("remove_page", { page_id: id })
  }

  pagesChanged(data, mine) {
    const index = this.pages.findIndex((p) => p.id === this.pageId)
    this.pages = data.pages
    if (data.added && mine) return this.loadPage(data.added)
    if (data.removed === this.pageId) {
      const next = this.pages[Math.min(index, this.pages.length - 1)]
      if (!mine) toast(`${data.by.nickname} deleted the page you were on.`)
      return this.loadPage(next.id)
    }
    this.renderPages()
  }

  renderPages() {
    const many = this.pages.length > 1
    this.pageListTarget.innerHTML = this.pages.map((page, i) => {
      const active = page.id === this.pageId
      const src = page.thumbnail_version ? `${this.urls.thumbnail.replace(":id", page.id)}?v=${page.thumbnail_version}` : null
      const image = src ? `<img class="page-thumb__img" src="${src}" alt="" draggable="false">` : `<span class="page-thumb__img"></span>`
      const menu = this.canPages ? `<span class="page-thumb__menu">
          <span role="button" title="Rename" data-action="click->board#renamePage">${ICON_EDIT}</span>
          ${many ? `<span role="button" class="is-danger" title="Delete page" data-action="click->board#removePage">${ICON_TRASH}</span>` : ""}
        </span>` : ""
      return `<button type="button" class="page-thumb${active ? " is-active" : ""}" data-page-id="${page.id}"
          data-action="click->board#switchPage dblclick->board#renamePage" aria-current="${active}" title="${escapeHTML(page.name)}">
          ${image}${menu}
          <span class="page-thumb__label">${i + 1}. ${escapeHTML(page.name)}</span>
        </button>`
    }).join("")
    this.pageListTarget.querySelector(".is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" })
    const page = this.page
    if (page) this.pageLabelTarget.textContent = `${page.name} · ${this.pages.indexOf(page) + 1} of ${this.pages.length}`
  }

  // --- thumbnails and export --------------------------------------------------------------------

  // Content bounds of the page in scene coordinates.
  bounds() {
    const objects = this.objects()
    if (!objects.length) return null
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    objects.forEach((o) => {
      const box = o.getBoundingRect()
      left = Math.min(left, box.left)
      top = Math.min(top, box.top)
      right = Math.max(right, box.left + box.width)
      bottom = Math.max(bottom, box.top + box.height)
    })
    return { left, top, width: right - left, height: bottom - top }
  }

  // Renders a scene region to a canvas element, independent of the current pan and zoom.
  renderRegion(region, scale) {
    const canvas = this.canvas
    const saved = canvas.viewportTransform.slice()
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0]
    const element = canvas.toCanvasElement(scale, region)
    canvas.setViewportTransform(saved)
    return element
  }

  snapshot(width, height, padding, scale = 1) {
    const box = this.bounds()
    const out = document.createElement("canvas")
    const ctx = out.getContext("2d")
    if (width && height) {
      out.width = width
      out.height = height
    }
    if (!box) {
      out.width ||= 1200
      out.height ||= 800
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, out.width, out.height)
      return out
    }
    const region = { left: box.left - padding, top: box.top - padding, width: box.width + padding * 2, height: box.height + padding * 2 }
    if (!width) {
      out.width = Math.round(region.width * scale)
      out.height = Math.round(region.height * scale)
    }
    const fitScale = Math.min(out.width / region.width, out.height / region.height)
    const s = width ? Math.min(fitScale, 1.5) : scale
    const image = this.renderRegion(region, s)
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(image, (out.width - image.width) / 2, (out.height - image.height) / 2)
    return out
  }

  scheduleThumbnail() {
    clearTimeout(this.thumbTimer)
    this.thumbPage = this.pageId
    this.thumbTimer = setTimeout(() => this.uploadThumbnail(), 1500)
  }

  flushThumbnail() {
    if (this.thumbTimer && this.thumbPage === this.pageId) {
      clearTimeout(this.thumbTimer)
      this.thumbTimer = null
      this.uploadThumbnail()
    }
  }

  async uploadThumbnail() {
    this.thumbTimer = null
    if (!this.canDraw || this.thumbPage !== this.pageId) return
    const image = this.snapshot(480, 300, 40).toDataURL("image/jpeg", 0.72)
    try {
      await request(this.urls.thumbnail.replace(":id", this.pageId), { method: "PUT", body: { image } })
    } catch {
      // A missed thumbnail is refreshed by the next edit.
    }
  }

  exportJpeg() {
    const box = this.bounds()
    const scale = box ? Math.min(2, 8000 / Math.max(box.width + 96, box.height + 96)) : 1
    const url = this.snapshot(null, null, 48, scale).toDataURL("image/jpeg", 0.92)
    const link = document.createElement("a")
    const name = `${this.boardNameTarget.value} - ${this.page?.name || "page"}`.replace(/[\\/:*?"<>|]+/g, " ").trim()
    link.download = `${name}.jpg`
    link.href = url
    link.click()
  }

  // --- viewport ---------------------------------------------------------------------------------

  wheel(o) {
    const e = o.e
    e.preventDefault()
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey) {
      const zoom = this.canvas.getZoom() * 0.998 ** (e.deltaY * (e.deltaMode === 1 ? 16 : 1))
      this.zoomAt(new Point(e.offsetX, e.offsetY), zoom)
    } else {
      const k = e.deltaMode === 1 ? 16 : 1
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
      this.canvas.relativePan(new Point(-dx * k, -dy * k))
      this.afterViewport()
    }
  }

  zoomAt(point, zoom) {
    this.canvas.zoomToPoint(point, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)))
    this.afterViewport()
  }

  center() { return new Point(this.canvas.width / 2, this.canvas.height / 2) }
  zoomIn() { this.zoomAt(this.center(), this.canvas.getZoom() * 1.25) }
  zoomOut() { this.zoomAt(this.center(), this.canvas.getZoom() / 1.25) }
  zoomReset() { this.zoomAt(this.center(), 1) }

  zoomFit({ maxZoom = 2 } = {}) {
    const box = this.bounds()
    if (!box) return this.setViewport(1, 0, 0)
    // Leave room for the floating chrome around the canvas.
    const pad = { left: 80, right: 40, top: 80, bottom: 120 }
    const width = this.canvas.width - pad.left - pad.right
    const height = this.canvas.height - pad.top - pad.bottom
    const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, Math.min(width / Math.max(box.width, 1), height / Math.max(box.height, 1))))
    const x = pad.left + (width - box.width * zoom) / 2 - box.left * zoom
    const y = pad.top + (height - box.height * zoom) / 2 - box.top * zoom
    this.setViewport(zoom, x, y)
  }

  setViewport(zoom, x, y) {
    this.canvas.setViewportTransform([zoom, 0, 0, zoom, x, y])
    this.afterViewport()
  }

  afterViewport() {
    const canvas = this.canvas
    if (!canvas) return
    const [zoom, , , , x, y] = canvas.viewportTransform
    const grid = 24 * zoom
    const visible = grid >= 8
    this.stageTarget.style.backgroundSize = `${grid}px ${grid}px`
    this.stageTarget.style.backgroundPosition = `${x}px ${y}px`
    this.stageTarget.style.backgroundImage = visible ? "" : "none"
    this.zoomLabelTarget.textContent = `${Math.round(zoom * 100)}%`
    this.cursors.forEach((cursor) => this.placeCursor(cursor))
    canvas.getActiveObject()?.setCoords()
    canvas.requestRenderAll()
  }

  startPan(e) {
    this.pan = { x: e.clientX, y: e.clientY, selection: this.canvas.selection, drawing: this.canvas.isDrawingMode }
    this.canvas.selection = false
    this.canvas.isDrawingMode = false
    this.element.classList.add("is-panning-active")
  }

  movePan(e) {
    this.canvas.relativePan(new Point(e.clientX - this.pan.x, e.clientY - this.pan.y))
    this.pan.x = e.clientX
    this.pan.y = e.clientY
    this.afterViewport()
  }

  endPan() {
    this.canvas.selection = this.pan.selection
    this.canvas.isDrawingMode = this.pan.drawing
    this.pan = null
    this.element.classList.remove("is-panning-active")
  }

  // --- keyboard ---------------------------------------------------------------------------------

  keyDown(e) {
    const typing = e.target.closest?.("input, textarea, select, [contenteditable]") || this.editingText()
    if (typing) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    if (key === " " && !this.spaceDown) {
      e.preventDefault()
      this.spaceDown = true
      this.spaceDrawing = this.canvas.isDrawingMode
      this.canvas.isDrawingMode = false
      this.element.classList.add("is-panning")
      return
    }
    if (mod && key === "z") { e.preventDefault(); return e.shiftKey ? this.redo() : this.undo() }
    if (mod && key === "y") { e.preventDefault(); return this.redo() }
    if (mod && (key === "=" || key === "+")) { e.preventDefault(); return this.zoomIn() }
    if (mod && key === "-") { e.preventDefault(); return this.zoomOut() }
    if (mod && key === "0") { e.preventDefault(); return this.zoomReset() }
    if (mod && key === "a" && this.canDraw) {
      e.preventDefault()
      this.pickToolByName("select")
      const all = this.objects()
      if (all.length) this.canvas.setActiveObject(all.length === 1 ? all[0] : new ActiveSelection(all, { canvas: this.canvas }))
      this.canvas.requestRenderAll()
      return
    }
    if (e.shiftKey && (e.code === "Digit1")) { e.preventDefault(); return this.zoomFit() }
    if (key === "delete" || key === "backspace") { e.preventDefault(); return this.deleteSelection() }
    if (key === "escape") {
      this.canvas.discardActiveObject()
      this.canvas.requestRenderAll()
      this.peoplePanelTarget.hidden = true
      return
    }
    if (!mod && !e.altKey && TOOL_KEYS[key]) this.pickToolByName(TOOL_KEYS[key])
  }

  keyUp(e) {
    if (e.key === " " && this.spaceDown) {
      this.spaceDown = false
      this.canvas.isDrawingMode = this.spaceDrawing
      this.element.classList.remove("is-panning")
    }
  }

  // --- cursors ----------------------------------------------------------------------------------

  sendCursor(point) {
    const now = performance.now()
    if (now - (this.lastCursor || 0) < 45) return
    this.lastCursor = now
    this.subscription?.perform("cursor", { page_id: this.pageId, x: point.x, y: point.y, tool: this.tool })
  }

  moveCursor(data) {
    let cursor = this.cursors.get(data.cid)
    if (!cursor) {
      const el = document.createElement("div")
      el.className = "cursor"
      el.innerHTML = `${CURSOR_SVG}<span class="cursor__name"></span>`
      this.cursorsTarget.append(el)
      cursor = { el }
      this.cursors.set(data.cid, cursor)
    }
    cursor.el.style.setProperty("--cursor", data.by.color)
    cursor.el.querySelector(".cursor__name").textContent = data.by.nickname
    Object.assign(cursor, { x: data.x, y: data.y, page: data.page_id, uid: data.by.uid, at: performance.now() })
    this.placeCursor(cursor)
  }

  placeCursor(cursor) {
    const [zoom, , , , x, y] = this.canvas.viewportTransform
    cursor.el.style.transform = `translate(${cursor.x * zoom + x}px, ${cursor.y * zoom + y}px)`
    cursor.el.classList.toggle("is-idle", cursor.page !== this.pageId || performance.now() - cursor.at > 5000)
  }

  hideIdleCursors() {
    this.cursors.forEach((cursor) => {
      if (performance.now() - cursor.at > 5000) cursor.el.classList.add("is-idle")
    })
  }

  dropGoneCursors() {
    const here = new Set(this.online.map((p) => p.uid))
    this.cursors.forEach((cursor, key) => {
      if (!here.has(cursor.uid)) {
        cursor.el.remove()
        this.cursors.delete(key)
      }
    })
  }

  // --- people and access ------------------------------------------------------------------------

  applyRole(role) {
    const before = this.me.role
    this.me.role = role
    this.element.dataset.role = role
    this.element.toggleAttribute("data-owner", !!this.me.owner)
    this.viewOnlyTarget.hidden = this.canDraw
    this.boardNameTarget.readOnly = !this.canManage
    if (before !== role && this.canvas) {
      if (!this.canDraw && this.tool !== "hand") this.pickToolByName("select")
      else this.pickToolByName(this.tool)
      this.renderPages()
      if (before) toast(`Your access changed: ${roleLabel(role).toLowerCase()}.`)
    }
    this.updateStylebar()
  }

  renderPresence() {
    const others = this.online
    const shown = others.slice(0, 5)
    const more = others.length - shown.length
    this.presenceTarget.innerHTML = shown.map((p) => avatarHTML(p.nickname, p.color, 30, p.uid === this.me.uid ? `${p.nickname} (you)` : p.nickname)).join("") +
      (more > 0 ? `<span class="presence__more">+${more}</span>` : "")
  }

  renderMembers() {
    const online = new Set(this.online.map((p) => p.uid))
    const members = [...this.members.values()].sort((a, b) =>
      (b.uid === this.me.uid) - (a.uid === this.me.uid) || online.has(b.uid) - online.has(a.uid) || RANK[b.role] - RANK[a.role] || a.nickname.localeCompare(b.nickname))

    this.memberListTarget.innerHTML = members.map((m) => {
      const you = m.uid === this.me.uid
      const editable = this.canManage && !m.owner && !you
      const tags = `${you ? '<span class="tag">You</span>' : ""}${m.owner ? '<span class="tag">Owner</span>' : ""}`
      const role = editable
        ? `<select class="input" data-uid="${m.uid}" data-action="change->board#changeRole" aria-label="Access for ${escapeHTML(m.nickname)}">
            ${["manager", "editor", "artist", "viewer"].map((r) => `<option value="${r}"${r === m.role ? " selected" : ""}>${roleLabel(r)}</option>`).join("")}
          </select>`
        : ""
      return `<li class="member">
          ${avatarHTML(m.nickname, m.color, 34)}
          <div class="member__who">
            <div class="member__name">${escapeHTML(m.nickname)} ${tags} ${online.has(m.uid) ? '<span class="member__online" title="Online now"></span>' : ""}</div>
            ${editable ? "" : `<div class="member__role">${roleLabel(m.owner ? "manager" : m.role)}</div>`}
          </div>
          ${role}
        </li>`
    }).join("")
  }

  async changeRole(event) {
    const select = event.currentTarget
    const response = await request(this.urls.members.replace(":uid", select.dataset.uid), { method: "PATCH", body: { role: select.value } })
    if (!response.ok) {
      toast("Could not change access.")
      this.renderMembers()
    }
  }

  async changeDefaultRole(event) {
    const response = await request(this.urls.board, { method: "PATCH", body: { link_role: event.currentTarget.value } })
    toast(response.ok ? "Link access updated. It applies to people who join from now on." : "Could not change link access.")
  }

  togglePanel() {
    this.peoplePanelTarget.hidden = !this.peoplePanelTarget.hidden
  }

  async renameBoard() {
    const name = this.boardNameTarget.value.trim()
    if (!name || !this.canManage) return
    await request(this.urls.board, { method: "PATCH", body: { name } })
  }

  blurTarget(event) {
    event.preventDefault()
    event.currentTarget.blur()
  }

  async share() {
    const url = `${location.origin}${this.urls.board}`
    try {
      await navigator.clipboard.writeText(url)
      toast("Link copied. Anyone with it can join with a nickname.")
    } catch {
      prompt("Copy this link:", url)
    }
  }

  confirmDelete(event) {
    if (!confirm("Delete this board with all its pages for everyone? This cannot be undone.")) event.preventDefault()
  }
}

const ICON_EDIT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`
const ICON_TRASH = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`
