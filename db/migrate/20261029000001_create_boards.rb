class CreateBoards < ActiveRecord::Migration[8.1]
  def change
    create_table :boards do |t|
      t.string :slug, null: false
      t.string :name, null: false
      t.string :owner_uid, null: false
      t.string :owner_name, null: false
      t.string :link_role, null: false, default: "editor"
      t.text :thumbnail
      t.datetime :last_activity_at, null: false
      t.timestamps
    end
    add_index :boards, :slug, unique: true
    add_index :boards, :last_activity_at

    create_table :pages do |t|
      t.references :board, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.integer :position, null: false, default: 0
      t.text :thumbnail
      t.timestamps
    end
    add_index :pages, [:board_id, :position]

    create_table :elements do |t|
      t.references :page, null: false, foreign_key: { on_delete: :cascade }
      t.string :uid, null: false
      t.string :kind, null: false
      t.jsonb :data, null: false, default: {}
      t.bigint :z, null: false
      t.string :author_uid
      t.string :author_name
      t.timestamps
    end
    add_index :elements, [:page_id, :uid], unique: true
    add_index :elements, [:page_id, :z]

    create_table :memberships do |t|
      t.references :board, null: false, foreign_key: { on_delete: :cascade }
      t.string :user_uid, null: false
      t.string :nickname, null: false
      t.string :role, null: false
      t.datetime :last_seen_at, null: false
      t.timestamps
    end
    add_index :memberships, [:board_id, :user_uid], unique: true
  end
end
