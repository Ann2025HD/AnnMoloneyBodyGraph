# app/services/incarnation_cross_index.rb
require "csv"

class IncarnationCrossIndex
  Row = Struct.new(:angle, :g1, :g2, :g3, :g4, :description, keyword_init: true)

  ANGLE_MAP = { "R" => "Right", "L" => "Left", "J" => "Juxtaposition" }.freeze
  DATA_PATH = Rails.root.join("lib", "hdkit", "data", "Incarnation_Cross_List.csv")

  class << self
    def find(angle:, gates:)
      load! if @index.nil?
      angle_norm = normalize_angle(angle)
      @index[key_exact(angle_norm, gates)]
    end

    private

    def load!
      @index = {}
      io = nil
      begin
        io = File.open(DATA_PATH, "r:bom|utf-8")
      rescue ArgumentError, Errno::ENOENT
        io = File.open(DATA_PATH, "r:UTF-8")
      end

      CSV.new(io, headers: true).each do |r|
        angle_norm = normalize_angle(r["angle"])
        g1, g2, g3, g4 = r.values_at("g1","g2","g3","g4").map { |v| v.to_i }

        row = Row.new(
          angle: angle_norm,
          g1: g1, g2: g2, g3: g3, g4: g4,
          description: r["description"].to_s.strip
        )

        @index[key_exact(angle_norm, [g1, g2, g3, g4])] = row
      end
    ensure
      io&.close
    end

    def normalize_angle(a)
      s = a.to_s.strip
      ANGLE_MAP[s.upcase] || s
    end

    # build a key that preserves the CSV order (no sorting)
    def key_exact(angle, gates)
      "#{angle}|#{gates.map { |g| g.to_i }.join('-')}"
    end
  end
end
