class Board < ApplicationRecord
  ROLES = %w[viewer artist editor manager].freeze

  has_many :pages, -> { order(:position, :id) }, dependent: :destroy, inverse_of: :board
  has_many :memberships, dependent: :destroy
  has_many :elements, through: :pages

  validates :name, presence: true, length: { maximum: 80 }
  validates :link_role, inclusion: { in: ROLES - %w[manager] }

  before_validation :assign_slug, on: :create
  before_validation { self.last_activity_at ||= Time.current }
  after_create { pages.create!(name: "Page 1", position: 0) }

  scope :recent, -> { order(last_activity_at: :desc) }

  def to_param = slug

  # Everyone who opens a board becomes a member with the board's link role; the creator owns it.
  def membership_for(uid, nickname)
    membership = memberships.find_or_initialize_by(user_uid: uid)
    membership.role ||= uid == owner_uid ? "manager" : link_role
    membership.nickname = nickname
    membership.last_seen_at = Time.current
    membership.save! if membership.changed?
    membership
  end

  def owner?(uid) = owner_uid == uid

  def touch_activity! = update_column(:last_activity_at, Time.current)

  private

  def assign_slug
    self.slug ||= loop do
      candidate = SecureRandom.alphanumeric(10).downcase
      break candidate unless Board.exists?(slug: candidate)
    end
  end
end
