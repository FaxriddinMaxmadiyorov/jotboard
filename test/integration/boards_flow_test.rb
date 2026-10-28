require "test_helper"

class BoardsFlowTest < ActionDispatch::IntegrationTest
  test "visitors pick a nickname before anything else" do
    get root_path
    assert_redirected_to new_session_path(return_to: "/")
    sign_in
    assert_redirected_to root_path
    follow_redirect!
    assert_response :success
    assert_select ".empty h2", text: "No boards yet"
  end

  test "a blank nickname is refused" do
    post session_path, params: { nickname: "   " }
    assert_response :unprocessable_entity
  end

  test "create a board and open it" do
    sign_in("Aziza")
    post boards_path, params: { board: { name: "Retro", link_role: "viewer" } }
    board = Board.last
    assert_redirected_to board_path(board)
    assert_equal "Aziza", board.owner_name
    assert_equal "viewer", board.link_role

    get board_path(board)
    assert_response :success
    assert_select "[data-controller=board][data-role=manager]"
    assert_equal "manager", board.memberships.sole.role
  end

  test "a board link remembers where to go after picking a name" do
    board = create_board
    get board_path(board)
    assert_redirected_to new_session_path(return_to: board_path(board))
    post session_path, params: { nickname: "Ben", return_to: board_path(board) }
    assert_redirected_to board_path(board)
  end

  test "the library lists every board" do
    create_board(name: "Alpha")
    create_board(name: "Beta")
    sign_in
    get root_path
    assert_select ".board-card__name", text: "Alpha"
    assert_select ".board-card__name", text: "Beta"
  end

  test "page elements come back as JSON" do
    board = create_board
    board.pages.first.elements.create!(uid: "e1", kind: "rect", data: { "type" => "Rect" })
    sign_in
    get elements_board_page_path(board, board.pages.first)
    assert_equal ["e1"], response.parsed_body["elements"].map { |e| e["uid"] }
  end

  test "thumbnails are uploaded by people who can draw and served as JPEG" do
    board = create_board
    page = board.pages.first
    sign_in
    get board_path(board)
    jpeg = "data:image/jpeg;base64,#{Base64.strict_encode64("\xFF\xD8\xFF\xE0fake".b)}"
    put thumbnail_board_page_path(board, page), params: { image: jpeg }, as: :json
    assert_response :no_content
    assert board.reload.thumbnail.present?

    get thumbnail_board_page_path(board, page, v: page.reload.updated_at.to_i)
    assert_equal "image/jpeg", response.media_type
    assert_equal "\xFF\xD8\xFF\xE0fake".b, response.body.b
  end

  test "only managers change settings and roles" do
    board = create_board(owner_uid: "someone-else")
    sign_in("Ben")
    get board_path(board)
    patch board_path(board), params: { name: "Hijacked" }, as: :json
    assert_response :forbidden

    me = board.memberships.find_by!(nickname: "Ben")
    patch board_membership_path(board, me.user_uid), params: { role: "manager" }, as: :json
    assert_response :forbidden

    me.update!(role: "manager")
    patch board_path(board), params: { name: "Renamed", link_role: "viewer" }, as: :json
    assert_response :no_content
    assert_equal ["Renamed", "viewer"], board.reload.values_at(:name, :link_role)
  end

  test "managers cannot demote the owner" do
    board = create_board(owner_uid: "owner")
    board.membership_for("owner", "Owner")
    sign_in("Ben")
    get board_path(board)
    board.memberships.find_by!(nickname: "Ben").update!(role: "manager")
    patch board_membership_path(board, "owner"), params: { role: "viewer" }, as: :json
    assert_response :unprocessable_entity
  end

  test "only the owner deletes a board" do
    sign_in("Aziza")
    post boards_path, params: { board: { name: "Mine" } }
    board = Board.last
    delete board_path(board)
    assert_redirected_to root_path
    assert_not Board.exists?(board.id)
  end
end
