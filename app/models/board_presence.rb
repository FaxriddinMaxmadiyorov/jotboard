# Who is looking at which board right now. Kept in memory: presence is about this moment, and the
# app runs in one process (see config/cable.yml for scaling notes).
module BoardPresence
  STORE = Concurrent::Map.new # board_id => Concurrent::Map(connection_key => visitor payload)

  module_function

  def join(board_id, key, visitor)
    STORE.compute_if_absent(board_id) { Concurrent::Map.new }[key] = visitor.as_payload
  end

  def leave(board_id, key)
    STORE[board_id]&.delete(key)
  end

  # One entry per person even with several tabs open.
  def list(board_id)
    (STORE[board_id]&.values || []).uniq { |v| v[:uid] }
  end

  def count(board_id) = list(board_id).size
end
