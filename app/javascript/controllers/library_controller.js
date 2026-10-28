import { Controller } from "@hotwired/stimulus"

// Board list: instant search and the "New board" dialog.
export default class extends Controller {
  static targets = ["search", "item", "none", "dialog"]

  filter() {
    const query = this.searchTarget.value.trim().toLowerCase()
    let shown = 0
    this.itemTargets.forEach((item) => {
      const match = !query || item.dataset.name.includes(query)
      item.hidden = !match
      if (match) shown++
    })
    if (this.hasNoneTarget) this.noneTarget.hidden = shown > 0
  }

  openNew() {
    this.dialogTarget.showModal()
    this.dialogTarget.querySelector("input[type=text]")?.focus()
  }

  closeNew() { this.dialogTarget.close() }
}
