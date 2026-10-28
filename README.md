# Jotboard

A shared whiteboard for teams that think out loud. Open a board, pick a name and draw with everyone else on it at the same time: strokes, shapes, sticky text, live cursors, several pages per board and per-person access. No accounts, no installs.

Built with Ruby on Rails 8.1, Action Cable (WebSockets), PostgreSQL, Hotwire (Turbo and Stimulus) and Fabric.js.

## What it does

- **No sign-up.** The first visit asks for a nickname. A random id is kept in a signed cookie, so the same browser stays the same person (and keeps ownership of its boards). The name can be changed at any time.
- **Board library.** Every board is listed for everyone, newest activity first, with a live preview of its first page, the number of pages, who made it and how many people are on it right now. Search by name or owner.
- **Real-time drawing.** Every change travels over a WebSocket to everyone on the board and is stored in PostgreSQL the moment it is made, so boards are kept forever and a reload shows exactly what was there.
- **Live cursors and presence.** You see other people's pointers with their names, and their avatars in the top bar.
- **Tools.** Pen, highlighter, eraser, line, arrow, rectangle, ellipse and text, 8 colors, 3 sizes, filled or outlined shapes. Select, move, resize, rotate and recolor anything. Undo and redo of your own changes.
- **An endless canvas.** The board fills the window around the floating tool panels. Scroll or drag with the hand tool (or hold Space) to pan, Ctrl + scroll or a trackpad pinch to zoom, fit to content in one click.
- **Pages.** Add, rename, delete and switch pages from the bottom strip. Each page has its own thumbnail.
- **Access.** Four roles: *Can view*, *Can draw* (edit existing pages), *Can draw and edit pages* (also add, rename and remove pages), *Full access* (also manage people and board settings). The board owner always has full access, chooses what people who open the link get, and can change anyone's role while they are on the board. The server checks the role on every operation.
- **Export.** Download the current page as a JPEG.

Keyboard: `V` select, `H` hand, `P` pen, `M` highlighter, `E` eraser, `L` line, `A` arrow, `R` rectangle, `O` ellipse, `T` text, `Del` delete, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, `Ctrl+A` select all, `Shift+1` fit, `Ctrl+=` / `Ctrl+-` zoom.

## How it works

| Piece | Where |
|---|---|
| Boards, pages, elements, memberships | `app/models`, `db/migrate` |
| WebSocket protocol: drawing, pages, cursors, presence, role checks | `app/channels/board_channel.rb` |
| Who is online (in memory, per process) | `app/models/board_presence.rb` |
| Nickname and visitor identity | `app/controllers/sessions_controller.rb`, `app/channels/application_cable/connection.rb` |
| Board screen: canvas, tools, sync, pages, people, export | `app/javascript/controllers/board_controller.js`, `app/javascript/board/*` |
| Library screen | `app/views/boards/index.html.erb`, `app/javascript/controllers/library_controller.js` |

Every drawn object is one `elements` row: the Fabric.js object as JSON plus a stacking number `z`. Clients send `add`, `update` and `remove` operations with a client-generated uid; the server checks the sender's role, writes the row and broadcasts the change to the board. Each browser tab has its own id, so the sender ignores its own echo and other tabs of the same person still get it. When a connection drops and comes back, the page is reloaded from the database, so nothing is missed.

Thumbnails are rendered in the browser of whoever last edited a page (480 x 300 JPEG) and stored with the page.

## Run it locally

You need Ruby 3.3 and PostgreSQL.

```sh
bundle install
bin/rails db:prepare
bin/rails server
```

Open http://localhost:3000. To try collaboration, open the board in a second browser or a private window, which counts as a different person.

Database settings come from `DB_HOST`, `DB_USERNAME` and `DB_PASSWORD` (see `config/database.yml`), or from `DATABASE_URL`.

Tests:

```sh
bin/rails test
```

## Deploy

The repository has a production `Dockerfile`. The container runs `db:prepare` on start, so a new database is created and migrated on the first boot.

Settings:

| Variable | Needed | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `SECRET_KEY_BASE` | yes | Signs the visitor cookie. Keep it fixed, or everyone becomes a new visitor after a restart. Make one with `openssl rand -hex 64`. |
| `ASSUME_SSL`, `FORCE_SSL` | behind HTTPS | Set both to `true` when a proxy terminates TLS (Railway, Render, Cloudflare). |
| `RAILS_MAX_THREADS` | no | Puma threads, 5 by default. |
| `CABLE_ALLOWED_ORIGINS` | no | Comma separated origins allowed to open WebSockets. Same-origin works without it. |

Railway: create a project from the repository, add the PostgreSQL service, then on the app service set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`, add `SECRET_KEY_BASE`, `ASSUME_SSL=true` and `FORCE_SSL=true`, and generate a domain for port 8080 (the port Railway passes in `PORT`).

The app runs as a single process: WebSocket broadcasts and presence live in that process (`config/cable.yml` uses the `async` adapter). To run several instances, switch Action Cable to the `postgresql` or Redis adapter and move presence to Redis.
