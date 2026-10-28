ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    def create_board(owner_uid: "owner-uid", owner_name: "Owner", link_role: "editor", name: "Plan")
      Board.create!(name: name, owner_uid: owner_uid, owner_name: owner_name, link_role: link_role)
    end
  end
end

class ActionDispatch::IntegrationTest
  def sign_in(nickname = "Aziza")
    post session_path, params: { nickname: nickname }
  end

end
