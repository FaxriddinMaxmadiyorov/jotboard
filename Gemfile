source "https://rubygems.org"

ruby ">= 3.3.0"

gem "rails", "~> 8.1.4"
gem "propshaft"
gem "pg", "~> 1.5"
gem "puma", ">= 6.0"
# Hotwire: Turbo for navigation, Stimulus for the board UI. Action Cable (part of Rails) carries
# the live drawing traffic.
gem "importmap-rails"
gem "turbo-rails"
gem "stimulus-rails"
gem "dotenv"
gem "tzinfo-data", platforms: %i[ windows jruby ]

group :development, :test do
  gem "debug", platforms: %i[ mri windows ], require: "debug/prelude"
  # Minitest 6 moved `minitest/mock` into a separate gem
  gem "minitest", "< 6"
end
