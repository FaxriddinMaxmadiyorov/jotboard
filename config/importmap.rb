pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin "@rails/actioncable", to: "actioncable.esm.js"
# Fabric.js 6.9.1 (MIT), vendored ESM build: canvas objects, brushes, selection and export
pin "fabric", to: "fabric.js"
pin_all_from "app/javascript/controllers", under: "controllers"
pin_all_from "app/javascript/board", under: "board"
