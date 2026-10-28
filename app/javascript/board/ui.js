// Small DOM helpers shared by the board screen.

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
}

export function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?"
}

export function avatarHTML(nickname, color, size = 32, title = nickname) {
  return `<span class="avatar" style="--avatar: ${escapeHTML(color)}; --size: ${size}px" title="${escapeHTML(title)}">${escapeHTML(initials(nickname))}</span>`
}

export function roleLabel(role) {
  return { viewer: "Can view", artist: "Can draw", editor: "Can draw and edit pages", manager: "Full access" }[role] || role
}

export function toast(message) {
  const box = document.getElementById("toasts")
  if (!box) return
  const el = document.createElement("div")
  el.className = "toast"
  el.textContent = message
  box.append(el)
  setTimeout(() => el.classList.add("is-leaving"), 3200)
  setTimeout(() => el.remove(), 3600)
}

// fetch with the CSRF token and JSON bodies.
export function request(url, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" }
  const token = document.querySelector('meta[name="csrf-token"]')?.content
  if (token) headers["X-CSRF-Token"] = token
  if (body) headers["Content-Type"] = "application/json"
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" }).then((r) => {
    if (!r.ok && method === "GET") throw new Error(`HTTP ${r.status}`)
    return r
  })
}
