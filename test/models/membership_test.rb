require "test_helper"

class MembershipTest < ActiveSupport::TestCase
  setup { @board = create_board }

  test "abilities grow with the role" do
    expected = {
      "viewer" => %i[view],
      "artist" => %i[view draw],
      "editor" => %i[view draw pages],
      "manager" => %i[view draw pages manage]
    }
    expected.each do |role, abilities|
      membership = @board.memberships.new(user_uid: "u-#{role}", nickname: role, role: role)
      %i[view draw pages manage].each do |ability|
        assert_equal abilities.include?(ability), membership.can?(ability), "#{role} #{ability}"
      end
    end
  end

  test "unknown roles are invalid" do
    assert_not @board.memberships.new(user_uid: "x", nickname: "X", role: "god").valid?
  end
end
