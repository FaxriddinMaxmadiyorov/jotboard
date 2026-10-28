require "test_helper"

class BoardTest < ActiveSupport::TestCase
  test "a new board gets a slug and a first page" do
    board = create_board
    assert_match(/\A[a-z0-9]{10}\z/, board.slug)
    assert_equal ["Page 1"], board.pages.map(&:name)
    assert_equal board.slug, board.to_param
  end

  test "the owner is always a manager, others get the link role" do
    board = create_board(link_role: "artist")
    assert_equal "manager", board.membership_for("owner-uid", "Owner").role
    guest = board.membership_for("guest", "Ben")
    assert_equal "artist", guest.role
    assert guest.persisted?
  end

  test "a changed link role does not change people who already joined" do
    board = create_board(link_role: "editor")
    board.membership_for("guest", "Ben")
    board.update!(link_role: "viewer")
    assert_equal "editor", board.membership_for("guest", "Ben").role
    assert_equal "viewer", board.membership_for("late", "Cleo").role
  end

  test "joining again updates the nickname" do
    board = create_board
    board.membership_for("guest", "Ben")
    assert_equal "Benjamin", board.membership_for("guest", "Benjamin").nickname
  end

  test "manager is not allowed as the link role" do
    board = Board.new(name: "x", owner_uid: "a", owner_name: "A", link_role: "manager")
    assert_not board.valid?
  end
end
