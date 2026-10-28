# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_29_000001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "boards", force: :cascade do |t|
    t.string "slug", null: false
    t.string "name", null: false
    t.string "owner_uid", null: false
    t.string "owner_name", null: false
    t.string "link_role", default: "editor", null: false
    t.text "thumbnail"
    t.datetime "last_activity_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["last_activity_at"], name: "index_boards_on_last_activity_at"
    t.index ["slug"], name: "index_boards_on_slug", unique: true
  end

  create_table "elements", force: :cascade do |t|
    t.bigint "page_id", null: false
    t.string "uid", null: false
    t.string "kind", null: false
    t.jsonb "data", default: {}, null: false
    t.bigint "z", null: false
    t.string "author_uid"
    t.string "author_name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["page_id", "uid"], name: "index_elements_on_page_id_and_uid", unique: true
    t.index ["page_id", "z"], name: "index_elements_on_page_id_and_z"
    t.index ["page_id"], name: "index_elements_on_page_id"
  end

  create_table "memberships", force: :cascade do |t|
    t.bigint "board_id", null: false
    t.string "user_uid", null: false
    t.string "nickname", null: false
    t.string "role", null: false
    t.datetime "last_seen_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id", "user_uid"], name: "index_memberships_on_board_id_and_user_uid", unique: true
    t.index ["board_id"], name: "index_memberships_on_board_id"
  end

  create_table "pages", force: :cascade do |t|
    t.bigint "board_id", null: false
    t.string "name", null: false
    t.integer "position", default: 0, null: false
    t.text "thumbnail"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id", "position"], name: "index_pages_on_board_id_and_position"
    t.index ["board_id"], name: "index_pages_on_board_id"
  end

  add_foreign_key "elements", "pages", on_delete: :cascade
  add_foreign_key "memberships", "boards", on_delete: :cascade
  add_foreign_key "pages", "boards", on_delete: :cascade
end
