# config/environments/production.rb
require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false

  # Caching / assets
  config.action_controller.perform_caching = true
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }
  config.cache_store = :memory_store

  # Files & SSL
  config.active_storage.service = :local
  config.assume_ssl = true
  config.force_ssl = true

  # Logging
  config.log_tags = [:request_id]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")
  config.silence_healthcheck_path = "/up"
  config.active_support.report_deprecations = false

  # Jobs: in-process async queue (no DB)
  config.active_job.queue_adapter = :async

  # Mailer (set your host if you use mailers)
  config.action_mailer.default_url_options = { host: "example.com" }

  # I18n
  config.i18n.fallbacks = true

  # Active Record (we use NullDB in prod)
  config.active_record.dump_schema_after_migration = false
  config.active_record.attributes_for_inspect = [:id]

end
