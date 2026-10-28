class SessionsController < ApplicationController
  skip_before_action :require_visitor

  def new
    @return_to = safe_return_to
  end

  def create
    nickname = params[:nickname].to_s.squish.first(32)
    if nickname.blank?
      @return_to = safe_return_to
      @error = "Pick a name so others know who is drawing."
      return render :new, status: :unprocessable_entity
    end

    cookies.signed.permanent[:jb_uid] = cookies.signed[:jb_uid].presence || SecureRandom.uuid
    cookies.signed.permanent[:jb_name] = nickname
    redirect_to safe_return_to || root_path
  end

  def destroy
    cookies.delete(:jb_name)
    redirect_to new_session_path
  end

  private

  def safe_return_to
    path = params[:return_to].to_s
    path.start_with?("/") && !path.start_with?("//") ? path : nil
  end
end
