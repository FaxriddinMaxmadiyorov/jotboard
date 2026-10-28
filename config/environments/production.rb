require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  config.action_controller.perform_caching = true
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Behind an HTTPS proxy (Railway, Render, Cloudflare) set ASSUME_SSL=true and FORCE_SSL=true.
  config.assume_ssl = ENV["ASSUME_SSL"] == "true"
  config.force_ssl = ENV["FORCE_SSL"] == "true"
  config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  config.log_tags = [ :request_id ]
  config.logger = ActiveSupport::TaggedLogging.logger(STDOUT)
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")
  config.silence_healthcheck_path = "/up"
  config.active_support.report_deprecations = false
  config.i18n.fallbacks = true
  config.active_record.dump_schema_after_migration = false
  config.active_record.attributes_for_inspect = [ :id ]

  # Optional extra origins for the websocket (comma separated), e.g. a second domain.
  if ENV["CABLE_ALLOWED_ORIGINS"].present?
    config.action_cable.allowed_request_origins = ENV["CABLE_ALLOWED_ORIGINS"].split(",").map(&:strip)
  end
end
