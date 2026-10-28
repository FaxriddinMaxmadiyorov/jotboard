# Live traffic of one board. Clients send drawing operations here; the server checks the sender's
# role, stores the change and rebroadcasts it to everyone on the board (including the sender, who
# recognises its own echo by the tab id `cid`). Cursor positions and presence are relayed without being stored.
class BoardChannel < ApplicationCable::Channel
  def subscribed
    @board = Board.find_by(slug: params[:board])
    return reject unless @board

    stream_for @board
    @cid = params[:cid].to_s.first(40).presence || SecureRandom.hex(8)
    @membership = @board.membership_for(current_visitor.uid, current_visitor.nickname)
    BoardPresence.join(@board.id, presence_key, current_visitor)
    broadcast(type: "member", member: @membership.as_payload)
    broadcast(type: "presence", people: BoardPresence.list(@board.id))
  end

  def unsubscribed
    return unless @board

    BoardPresence.leave(@board.id, presence_key)
    broadcast(type: "presence", people: BoardPresence.list(@board.id))
  end

  # --- elements ---------------------------------------------------------------------------------

  def add(data)
    return unless allowed?(:draw)
    page = page_for(data)
    return unless page

    element = page.elements.find_or_initialize_by(uid: data["uid"].to_s)
    element.assign_attributes(kind: data["kind"], data: data["data"], author_uid: current_visitor.uid,
      author_name: current_visitor.nickname)
    element.z = nil if element.new_record?
    if element.save
      touched
      broadcast(type: "element.added", page_id: page.id, element: element.as_payload)
    else
      transmit({ type: "error", message: element.errors.full_messages.to_sentence })
    end
  end

  def update(data)
    return unless allowed?(:draw)
    page = page_for(data)
    element = page&.elements&.find_by(uid: data["uid"].to_s)
    return unless element

    if element.update(data: data["data"])
      touched
      broadcast(type: "element.updated", page_id: page.id, element: element.as_payload)
    end
  end

  def remove(data)
    return unless allowed?(:draw)
    page = page_for(data)
    return unless page

    uids = Array(data["uids"]).map(&:to_s).first(500)
    removed = page.elements.where(uid: uids).delete_all
    return if removed.zero?

    touched
    broadcast(type: "element.removed", page_id: page.id, uids: uids)
  end

  def clear(data)
    return unless allowed?(:draw)
    page = page_for(data)
    return unless page

    page.elements.delete_all
    touched
    broadcast(type: "page.cleared", page_id: page.id)
  end

  # Live position of the pointer, never stored.
  def cursor(data)
    broadcast(type: "cursor", page_id: data["page_id"].to_i, x: data["x"].to_f.round(1), y: data["y"].to_f.round(1),
      tool: data["tool"].to_s.first(16))
  end

  # --- pages ------------------------------------------------------------------------------------

  def add_page(data)
    return unless allowed?(:pages)

    position = (@board.pages.maximum(:position) || -1) + 1
    page = @board.pages.create!(name: data["name"].presence&.first(60) || "Page #{@board.pages.count + 1}", position: position)
    touched
    broadcast_pages(added: page.id)
  end

  def rename_page(data)
    return unless allowed?(:pages)
    page = page_for(data)
    return unless page && data["name"].present?

    page.update!(name: data["name"].to_s.strip.first(60))
    broadcast_pages
  end

  def remove_page(data)
    return unless allowed?(:pages)
    page = page_for(data)
    return unless page && @board.pages.count > 1

    page.destroy!
    @board.pages.reload.each_with_index { |p, i| p.update_column(:position, i) if p.position != i }
    touched
    broadcast_pages(removed: page.id)
  end

  private

  # One entry per open tab, so two tabs of the same person count once in the list but leaving one
  # tab does not hide the other.
  def presence_key = "#{current_visitor.uid}:#{@cid}"

  def allowed?(ability)
    @membership.reload
    return true if @membership.can?(ability)

    transmit({ type: "error", message: "Your access to this board does not allow that." })
    false
  end

  def page_for(data) = @board.pages.find_by(id: data["page_id"])

  def touched = @board.touch_activity!

  def broadcast(payload)
    BoardChannel.broadcast_to(@board, payload.merge(by: current_visitor.as_payload, cid: @cid))
  end

  def broadcast_pages(extra = {})
    broadcast({ type: "pages", pages: @board.pages.reload.map(&:as_summary) }.merge(extra))
  end
end
