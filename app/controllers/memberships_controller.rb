class MembershipsController < ApplicationController
  before_action :find_board

  def update
    return head(:forbidden) unless membership.can?(:manage)

    target = @board.memberships.find_by!(user_uid: params[:uid])
    return head(:unprocessable_entity) if target.owner? || !Board::ROLES.include?(params[:role])

    target.update!(role: params[:role])
    BoardChannel.broadcast_to(@board, type: "member", member: target.as_payload, by: current_visitor.as_payload)
    head :no_content
  end
end
