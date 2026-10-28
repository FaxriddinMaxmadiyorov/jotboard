class ApplicationController < ActionController::Base
  before_action :require_visitor
  helper_method :current_visitor

  private

  def current_visitor
    return @current_visitor if defined?(@current_visitor)

    uid = cookies.signed[:jb_uid]
    nickname = cookies.signed[:jb_name]
    @current_visitor = uid.present? && nickname.present? ? Visitor.new(uid: uid, nickname: nickname) : nil
  end

  def require_visitor
    return if current_visitor

    respond_to do |format|
      format.html { redirect_to new_session_path(return_to: request.fullpath) }
      format.any { head :unauthorized }
    end
  end

  def find_board
    @board = Board.find_by!(slug: params[:board_slug] || params[:slug])
  end

  def membership
    @membership ||= @board.membership_for(current_visitor.uid, current_visitor.nickname)
  end

  def require!(ability)
    head :forbidden unless membership.can?(ability)
  end

  # Thumbnails are stored as JPEG data URLs sent by the board page.
  def send_thumbnail(data_url, version)
    return head(:not_found) if data_url.blank?

    expires_in 1.year, public: true if params[:v].present? && params[:v].to_s == version.to_s
    send_data Base64.decode64(data_url.split(",", 2).last), type: "image/jpeg", disposition: "inline"
  end
end
