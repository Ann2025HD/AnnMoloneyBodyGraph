# app/models/chart_form.rb
require "active_model"

class ChartForm
  include ActiveModel::Model

  # add/remove fields to match your form:
  attr_accessor :name, :date, :date_iso, :time,
                :location, :place_id, :place_text, :lat, :lng
end

