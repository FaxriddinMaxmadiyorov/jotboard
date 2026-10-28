module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_visitor

    def connect
      uid = cookies.signed[:jb_uid]
      nickname = cookies.signed[:jb_name]
      reject_unauthorized_connection if uid.blank? || nickname.blank?
      self.current_visitor = Visitor.new(uid: uid, nickname: nickname)
    end
  end
end
