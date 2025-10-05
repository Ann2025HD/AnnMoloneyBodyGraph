class ChartsController < ApplicationController
  require "open3"
  require "json"
  require "prawn"
  require "prawn/table"
  require "prawn-svg"

  def download
    name  = params[:name].presence || "Test"
    date  = params[:date]
    time  = params[:time]
    place = params[:place]

    respond_to do |format|
      format.pdf do
        render pdf: "HumanDesign_#{name.to_s.parameterize}",
               template: "charts/pdf",
               formats: [:html],
               layout: false,
               locals: { name:, date:, time:, place: }
      end
      format.html { render plain: "Add .pdf to the URL", status: :ok }
    end
  end

  def download_prawn
  # Params
  name  = params[:name].presence || "Ann Moloney Human Design"
  date  = params[:date].to_s
  time  = params[:time].presence || "12:00"
  place = params[:place].to_s
  tz    = params[:tz].presence || @chart&.timezone_iana || "UTC"

  # Call Node CLI
  cli = Rails.root.join("lib/hdkit/cli.mjs")
  node_bin = `which node`.to_s.strip
  node_bin = "/opt/homebrew/bin/node" if node_bin.empty?

  cmd = [
    node_bin, cli.to_s,
    "--date=#{date}",
    "--time=#{time}",
    "--place=#{place}",
    "--tz=#{tz}",
    "--debug=true"
  ]
  out, err, status = Open3.capture3(*cmd)

  unless status.success? && out.present?
    render plain: "Chart generator error:\n#{err.presence || out.presence || 'no output'}",
           status: :bad_gateway and return
  end

  begin
    data = JSON.parse(out)
  rescue JSON::ParserError => e
    Rails.logger.error "[HDKIT] JSON parse error: #{e.message} | RAW: #{out[0,500]}"
    render plain: "Invalid output from chart generator", status: :bad_gateway and return
  end

  # Build chart hash
  chart = {
    type:                data["type"],
    profile:             data["profile"],
    definition:          data["definition"],
    authority:           data["authority"],
    strategy:            data["strategy"],
    not_self:            data["notSelf"] || data["not_self"],
    cross:               data["cross"],
    design_planets:      (data["designPlanets"] || []),
    personality_planets: (data["personalityPlanets"] || []),
    svg:                 data["svg"].to_s
  }

  # ---- Profile from Sun lines (fallback to Earth) ----
  def line_from(rows, planet)
    v = rows.to_h[planet]
    return nil unless v
    line = v.to_s.split(".").last.to_i
    (1..6).include?(line) ? line : nil
  end
  p_line = line_from(chart[:personality_planets], "Sun")  || line_from(chart[:personality_planets], "Earth")
  d_line = line_from(chart[:design_planets],      "Sun")  || line_from(chart[:design_planets],      "Earth")
  chart[:profile] = "#{p_line}/#{d_line}" if p_line && d_line
  # ----------------------------------------------------

  pdf = Prawn::Document.new(page_size: "A4", margin: 36)
  # Header

  pdf.fill_color "95AECF" 
  pdf.text "HUMAN DESIGN READING FOR", size: 18
  pdf.move_down 6
  pdf.fill_color "000000" 
  title = name.to_s.split.map(&:capitalize).join(" ")
  pdf.text title, size: 18, style: :bold
  pdf.move_down 4

  formatted_date =
    begin
      Date.strptime(date.to_s, "%Y-%m-%d").strftime("%d/%m/%Y")  # -> "25/09/1983"
    rescue
      date.to_s
    end

  born_line = [formatted_date, time, place].compact.join(" | ")
  pdf.fill_color "444444"; pdf.text born_line, size: 9; pdf.fill_color "000000"
  pdf.move_down 6
  pdf.stroke_color "D1D0D1"; pdf.stroke_horizontal_rule; pdf.move_down 10

  # Facts table
  facts_rows = [
    ["<b>Type</b>", chart[:type], "<b>Profile</b>", chart[:profile]],
    ["<b>Definition</b>", chart[:definition], "<b>Inner Authority</b>", chart[:authority]],
    ["<b>Strategy</b>", chart[:strategy], "<b>Not-Self Theme</b>", chart[:not_self]],
    ["<b>Incarnation Cross</b>", chart[:cross], "", ""]
  ]
  t = pdf.make_table(facts_rows, width: pdf.bounds.width,
                     cell_style: { size: 10, inline_format: true, borders: [:top,:bottom,:left,:right], border_color: "D1D0D1", padding: 6 })
  t.cells.overflow = :shrink_to_fit; t.cells.min_font_size = 8; t.draw
  pdf.move_down 30

  # Layout
  content_w = pdf.bounds.width; gap = 10
  left_w  = 130; right_w = 130; middle_w = content_w - left_w - right_w - gap*2
  start_y = pdf.cursor

  planet_order = ["Sun","Earth","Moon","North Node","South Node" , "Mercury" , "Venus" , "Mars" , "Jupiter" , "Saturn","Uranus","Neptune","Pluto"]

  planet_rows = ->(order, pairs) do
    h = pairs.to_h
    [["Planet","Gate.Line"]] + order.map { |p| [p, (h[p] || "")] }
  end

# Left (Design)
pdf.bounding_box([0, start_y], width: left_w, height: 420) do
  # 1) Register + select Unicode font FIRST
  font_path_regular = Rails.root.join("app/assets/fonts/DejaVuSans.ttf")
  font_path_bold    = Rails.root.join("app/assets/fonts/DejaVuSans-Bold.ttf")
  font_family = nil
  if File.exist?(font_path_regular)
    families = { normal: font_path_regular.to_s }
    families[:bold] = font_path_bold.to_s if File.exist?(font_path_bold)
    pdf.font_families.update("DejaVuSans" => families)
    pdf.font("DejaVuSans")
    font_family = "DejaVuSans"     
  else
    Rails.logger.warn "[PDF] DejaVuSans.ttf not found at #{font_path_regular}"
  end

  pdf.fill_color "F03020"
  pdf.text "Design", size: 16, align: :center   # ← centered title


  rows = planet_rows.call(planet_order, chart[:design_planets])

  glyph = {
    "Sun"=>"☉","Moon"=>"☽","Mercury"=>"☿","Venus"=>"♀","Mars"=>"♂",
    "Jupiter"=>"♃","Saturn"=>"♄","Uranus"=>"♅","Neptune"=>"♆","Pluto"=>"♇",
    "Earth"=>"♁","North Node"=>"☊","South Node"=>"☋"
  }
  rows = rows.map.with_index { |(name, gl), i| i.zero? ? [name, gl] : [glyph[name] || name, gl] }
  rows.shift  # ← drop ["Planet","Gate.Line"]


  pdf.move_down 4
  table_w  = (left_w * 0.68).to_i   # was 0.76 → slightly narrower
  base_ix  = (left_w - table_w) / 2 # centered within left column
  nudge_px = 8                      # small push toward the middle of the page
  indent_x = base_ix + nudge_px
  c1 = c2 = table_w / 2

  # 2) Default table cell style
  cell_opts = {
    size: 9,
    borders: [:top, :bottom, :left, :right],
    border_color: "e5e5ea",
    padding: 4
  }
  cell_opts[:font] = font_family if font_family

  pdf.indent(indent_x) do  
     pdf.table rows,
        header: false,
        width: table_w,
        row_colors: %w[ffffff f8f8f8],
        column_widths: [c1, c2],
        cell_style: cell_opts do |t|

        t.cells.style(font: font_family) if font_family
        t.columns(0).rows(1..-1).style(text_color: "E3B157",
               size: 16,
               align: :center,
               font_style: :bold)
         t.columns(1).style(size: 8, align: :center, valign: :center, font_style: :normal) 

        # Header row
        t.columns(0).rows(0).style(text_color: "E3B157",
              size: 16,
              align: :center,
              font_style: :bold)
        t.columns(1).rows(0).style(size: 8, align: :center, align: :center, font_style: :normal)
    end 
  end
end
  


  # Middle (SVG bodygraph)
  pdf.bounding_box([left_w + gap, start_y], width: middle_w, height: 420) do
    pdf.svg chart[:svg].to_s, width: (middle_w - 12), position: :center, vposition: :top
  end

 # Right (Personality)
pdf.bounding_box([left_w + gap + middle_w + gap, start_y], width: right_w, height: 420) do
  font_path_regular = Rails.root.join("app/assets/fonts/DejaVuSans.ttf")
  font_path_bold    = Rails.root.join("app/assets/fonts/DejaVuSans-Bold.ttf")
  font_family = nil
  if File.exist?(font_path_regular)
    families = { normal: font_path_regular.to_s }
    families[:bold] = font_path_bold.to_s if File.exist?(font_path_bold)
    pdf.font_families.update("DejaVuSans" => families)
    pdf.font("DejaVuSans")
    font_family = "DejaVuSans"     
  else
    Rails.logger.warn "[PDF] DejaVuSans.ttf not found at #{font_path_regular}"
  end

  pdf.fill_color "111111"
  pdf.text "Personality", size: 16, align: :center

 rows = planet_rows.call(planet_order, chart[:personality_planets])
  glyph = {
    "Sun"=>"☉","Moon"=>"☽","Mercury"=>"☿","Venus"=>"♀","Mars"=>"♂",
    "Jupiter"=>"♃","Saturn"=>"♄","Uranus"=>"♅","Neptune"=>"♆","Pluto"=>"♇",
    "Earth"=>"♁","North Node"=>"☊","South Node"=>"☋"
  }
 rows = rows.map.with_index { |(name, gl), i| i.zero? ? [name, gl] : [gl, (glyph[name] || name)] }
 rows.shift


  pdf.move_down 4
  table_w  = (right_w * 0.68).to_i      # width of the table
  base_ix  = (right_w - table_w) / 2 # centered within left column
  nudge_px = 8                      # small push toward the middle of the page
  indent_x = base_ix + nudge_px
  c1 = c2 = table_w / 2

  cell_opts = {
    size: 9,
    borders: [:top, :bottom, :left, :right],
    border_color: "e5e5ea",
    padding: 4
  }

  cell_opts[:font] = font_family if font_family
  pdf.indent(indent_x) do  
     pdf.table rows,
        header: false,
        width: table_w,
        row_colors: %w[ffffff f8f8f8],
        column_widths: [c1, c2],
        cell_style: cell_opts do |t|

        t.cells.style(font: font_family) if font_family
        t.columns(1).rows(1..-1).style(text_color: "E3B157",
               size: 16,
               align: :center,
               font_style: :bold)
        t.columns(0).style(size: 8, align: :center, valign: :center, font_style: :normal) 
        # Header row
        t.columns(1).rows(0).style(text_color: "E3B157",
              size: 16,
              align: :center,
              font_style: :bold)
        t.columns(0).rows(0).style(size: 8, align: :center, valign: :center, font_style: :normal)
    end 
  end
end


  # Footer
  pdf.move_cursor_to 36
  pdf.stroke_color "dddddd"; pdf.stroke_horizontal_rule; pdf.move_down 4
  pdf.fill_color "666666"; pdf.text "Generated by Ann Moloney Human Design 2025   www.annmoloney.com", size: 8, align: :center
  pdf.fill_color "000000"

  send_data pdf.render,
            filename: "HumanDesign_#{name.to_s.parameterize}.pdf",
            type: "application/pdf",
            disposition: (params[:download] == "1" ? "attachment" : "inline")
   end
end
