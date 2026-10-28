Rails.application.routes.draw do
  root "boards#index"

  # No accounts: a visitor only picks a nickname.
  resource :session, only: %i[new create destroy]

  resources :boards, path: "b", param: :slug, only: %i[index create show update destroy] do
    member do
      get :thumbnail
    end
    resources :pages, only: [] do
      member do
        get :elements
        get :thumbnail
        put :thumbnail, action: :upload_thumbnail
      end
    end
    resources :memberships, only: %i[update], param: :uid
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
