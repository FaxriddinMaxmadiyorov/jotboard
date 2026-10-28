# The person behind a browser. There are no accounts: a random id is kept in a signed cookie and the
# nickname is whatever they typed. Each visitor gets a stable color for avatars and cursors.
class Visitor < Data.define(:uid, :nickname)
  COLORS = %w[#E5484D #F76B15 #D99A00 #30A46C #12A594 #0090FF #3E63DD #8E4EC6 #D6409F #6E56CF].freeze

  def self.color_for(uid) = COLORS[uid.to_s.sum % COLORS.size]

  def color = self.class.color_for(uid)
  def as_payload = { uid: uid, nickname: nickname, color: color }
end
