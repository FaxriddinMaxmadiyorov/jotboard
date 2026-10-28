require "test_helper"

class BoardChannelTest < ActionCable::Channel::TestCase
  setup do
    @board = create_board(owner_uid: "owner", link_role: "artist")
    @page = @board.pages.first
  end

  def join_as(uid, nickname = uid)
    stub_connection(current_visitor: Visitor.new(uid: uid, nickname: nickname))
    subscribe(board: @board.slug, cid: "tab-#{uid}")
    assert subscription.confirmed?
  end

  test "rejects unknown boards" do
    stub_connection(current_visitor: Visitor.new(uid: "x", nickname: "X"))
    subscribe(board: "nope")
    assert subscription.rejected?
  end

  test "joining makes you a member and announces presence" do
    assert_broadcasts(@board, 2) { join_as("ben", "Ben") }
    assert_equal "artist", @board.memberships.find_by(user_uid: "ben").role
  end

  test "an artist can add, update and remove elements and everyone hears it" do
    join_as("ben")
    data = { "type" => "Rect", "left" => 10, "top" => 20, "width" => 30, "height" => 40, "uid" => "e1", "kind" => "rect" }

    assert_broadcasts(@board, 1) { perform :add, page_id: @page.id, uid: "e1", kind: "rect", data: data }
    element = @page.elements.find_by!(uid: "e1")
    assert_equal 30, element.data["width"]

    perform :update, page_id: @page.id, uid: "e1", data: data.merge("width" => 99)
    assert_equal 99, element.reload.data["width"]

    perform :remove, page_id: @page.id, uids: ["e1"]
    assert_not @page.elements.exists?(uid: "e1")
  end

  test "broadcasts carry the tab id so the sender can skip its own echo" do
    join_as("ben")
    perform :add, page_id: @page.id, uid: "e1", kind: "rect", data: { "type" => "Rect" }
    message = broadcasts(BoardChannel.broadcasting_for(@board)).map { |m| JSON.parse(m) }.find { |m| m["type"] == "element.added" }
    assert_equal "tab-ben", message["cid"]
    assert_equal "ben", message.dig("by", "uid")
  end

  test "viewers cannot draw" do
    @board.membership_for("vic", "Vic").update!(role: "viewer")
    join_as("vic")
    perform :add, page_id: @page.id, uid: "e1", kind: "rect", data: {}
    assert_not @page.elements.exists?
    assert_equal "error", transmissions.last["type"]
  end

  test "artists cannot change pages, editors can" do
    join_as("ben")
    perform :add_page, {}
    assert_equal 1, @board.pages.count

    @board.memberships.find_by(user_uid: "ben").update!(role: "editor")
    perform :add_page, {}
    perform :add_page, name: "Ideas"
    assert_equal ["Page 1", "Page 2", "Ideas"], @board.pages.reload.map(&:name)

    perform :rename_page, page_id: @page.id, name: "Intro"
    assert_equal "Intro", @page.reload.name

    perform :remove_page, page_id: @page.id
    assert_equal [0, 1], @board.pages.reload.map(&:position)
  end

  test "the last page cannot be removed" do
    join_as("owner")
    perform :remove_page, page_id: @page.id
    assert @board.pages.exists?(@page.id)
  end

  test "elements cannot be written into another board's page" do
    other = create_board(owner_uid: "z").pages.first
    join_as("ben")
    perform :add, page_id: other.id, uid: "e1", kind: "rect", data: {}
    assert_not Element.exists?
  end
end
