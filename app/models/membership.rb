# What one person (identified by the anonymous id in their browser cookie) may do on a board.
#   viewer  - look, follow along, export
#   artist  - draw, edit and erase on existing pages
#   editor  - artist + add, rename and remove pages
#   manager - editor + change other people's access and the board settings
class Membership < ApplicationRecord
  RANK = Board::ROLES.each_with_index.to_h.freeze

  belongs_to :board

  validates :role, inclusion: { in: Board::ROLES }
  validates :nickname, presence: true

  def can?(ability)
    needed = { view: "viewer", draw: "artist", pages: "editor", manage: "manager" }.fetch(ability)
    RANK.fetch(role) >= RANK.fetch(needed)
  end

  def owner? = board.owner_uid == user_uid

  def as_payload = { uid: user_uid, nickname: nickname, role: role, owner: owner?, color: Visitor.color_for(user_uid) }
end
