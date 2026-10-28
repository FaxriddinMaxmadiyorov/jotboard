class BoardsController < ApplicationController
  before_action :find_board, only: %i[show update destroy thumbnail]

  def index
    @boards = Board.recent.includes(:pages).limit(300)
    @page_counts = Page.where(board_id: @boards.map(&:id)).group(:board_id).count
    @member_counts = Membership.where(board_id: @boards.map(&:id)).group(:board_id).count
  end

  def create
    board = Board.new(name: params.dig(:board, :name).to_s.squish.first(80).presence || "Untitled board",
      link_role: params.dig(:board, :link_role).presence || "editor",
      owner_uid: current_visitor.uid, owner_name: current_visitor.nickname)
    board.link_role = "editor" unless Board::ROLES.include?(board.link_role) && board.link_role != "manager"
    board.save!
    board.membership_for(current_visitor.uid, current_visitor.nickname)
    redirect_to board_path(board)
  end

  def show
    response.headers["Cache-Control"] = "no-store"
    membership
    @pages = @board.pages.to_a
    @members = @board.memberships.order(last_seen_at: :desc).limit(200)
  end

  # Board name and default access (managers only).
  def update
    return head(:forbidden) unless membership.can?(:manage)

    attrs = {}
    attrs[:name] = params[:name].to_s.squish.first(80) if params[:name].present?
    attrs[:link_role] = params[:link_role] if (Board::ROLES - %w[manager]).include?(params[:link_role])
    @board.update!(attrs)
    BoardChannel.broadcast_to(@board, type: "board", board: { name: @board.name, link_role: @board.link_role },
      by: current_visitor.as_payload)
    head :no_content
  end

  def destroy
    return head(:forbidden) unless @board.owner?(current_visitor.uid)

    @board.destroy!
    BoardChannel.broadcast_to(@board, type: "board.deleted", by: current_visitor.as_payload)
    redirect_to root_path, status: :see_other, notice: "Board deleted."
  end

  def thumbnail
    send_thumbnail(@board.thumbnail, @board.updated_at.to_i)
  end
end
