class PagesController < ApplicationController
  before_action :find_board
  before_action :find_page

  def elements
    membership
    render json: { page_id: @page.id, elements: @page.elements.map(&:as_payload) }
  end

  def thumbnail
    send_thumbnail(@page.thumbnail, @page.updated_at.to_i)
  end

  # The board page renders thumbnails in the browser and sends them here a few seconds after edits.
  def upload_thumbnail
    return head(:forbidden) unless membership.can?(:draw)

    data = params[:image].to_s
    return head(:unprocessable_entity) unless data.start_with?("data:image/jpeg;base64,") && data.bytesize < 400_000

    @page.update!(thumbnail: data)
    @board.update_columns(thumbnail: data, updated_at: Time.current) if @page.position.zero? || @board.thumbnail.blank?
    BoardChannel.broadcast_to(@board, type: "thumbnail", page_id: @page.id, version: @page.updated_at.to_i,
      by: current_visitor.as_payload)
    head :no_content
  end

  private

  def find_page
    @page = @board.pages.find(params[:id])
  end
end
