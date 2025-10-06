# config/initializers/nulldb.rb
# Explicitly load the NullDB adapter so Rails 8 can find it
require "active_record/connection_adapters/nulldb_adapter"
