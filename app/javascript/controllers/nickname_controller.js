import { Controller } from "@hotwired/stimulus"

// Live preview of the initials people will see next to your cursor.
export default class extends Controller {
  static targets = ["input", "avatar"]

  connect() { this.preview() }

  preview() {
    const name = this.inputTarget.value.trim()
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    this.avatarTarget.textContent = initials || "?"
    this.avatarTarget.style.setProperty("--avatar", name ? "#111318" : "#B8BEC8")
  }
}
