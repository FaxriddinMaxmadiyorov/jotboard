class Page < ApplicationRecord
  belongs_to :board
  has_many :elements, -> { order(:z) }, dependent: :delete_all

  validates :name, presence: true, length: { maximum: 60 }

  def as_summary
    { id: id, name: name, position: position, thumbnail_version: thumbnail.present? ? updated_at.to_i : nil }
  end
end
