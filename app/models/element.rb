# One drawn object on a page (a stroke, shape or text). `data` holds the Fabric.js object as JSON;
# `z` is an increasing number so every client stacks elements the same way.
class Element < ApplicationRecord
  KINDS = %w[path line arrow rect ellipse text].freeze
  MAX_DATA_BYTES = 200_000

  belongs_to :page

  validates :uid, presence: true, length: { maximum: 64 }
  validates :kind, inclusion: { in: KINDS }
  validate :data_size

  before_validation { self.z ||= Element.next_z }

  Z_LOCK = Mutex.new

  # Stacking order: microseconds since the epoch, strictly increasing within the process. Newer
  # elements land on top; across processes clocks are close enough that ties only reorder elements
  # created in the same instant.
  def self.next_z
    Z_LOCK.synchronize do
      now = Process.clock_gettime(Process::CLOCK_REALTIME, :microsecond)
      @last_z = [now, (@last_z || 0) + 1].max
    end
  end

  def as_payload = { uid: uid, kind: kind, data: data, z: z, author: author_name }

  private

  def data_size
    errors.add(:data, "is too large") if data.to_json.bytesize > MAX_DATA_BYTES
  end
end
