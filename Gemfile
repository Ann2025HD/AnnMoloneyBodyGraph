source "https://rubygems.org"

gem "rails", "~> 8.0.3"
gem "propshaft"
gem "puma", ">= 5.0"
gem "importmap-rails"
gem "turbo-rails"
gem "stimulus-rails"
gem "jbuilder"
gem "tzinfo-data", platforms: %i[windows jruby]
gem "wicked_pdf"
gem "wkhtmltopdf-binary"
gem "bootsnap", require: false
gem "kamal", require: false
gem "thruster", require: false
gem "rest-client"
gem "swe4r"
gem "geocoder"
gem "prawn", "~> 2.5"
gem "prawn-svg", "~> 0.38.0"
gem "prawn-table", "~> 0.2.2"

group :development, :test do
  gem "debug", platforms: %i[mri windows], require: "debug/prelude"
  gem "brakeman", require: false
  gem "rubocop-rails-omakase", require: false

  # local DB for dev/test
  gem "sqlite3", "~> 2.1"

  # keep Solid* only for dev/test
  gem "solid_cache"
  gem "solid_queue"
  gem "solid_cable"
end

group :development do
  gem "web-console"
end

group :test do
  gem "capybara"
  gem "selenium-webdriver"
end

group :production do
  # no real DB in prod
  gem "activerecord-nulldb-adapter"
end
