# app/controllers/charts_controller.rb
#===========================================================
# CHARTS CONTROLLER — PDF GENERATION (WickedPDF + Prawn)
#===========================================================
class ChartsController < ApplicationController
  #---------------------------------------------------------
  # REQUIREMENTS
  #---------------------------------------------------------
  require "open3"
  require "json"
  require "prawn"
  require "prawn/table"
  require "prawn-svg"
  require "csv"

  #===========================================================
  # NEW — SHOWS THE SIMPLE (NON-POPUP) FORM
  #===========================================================
  def new
  @chart = Bodygraph.new
end

def edit
  @chart = Bodygraph.find(params[:id])
end



  #===========================================================
  # DEF DOWNLOAD (WickedPDF) — RENDERS PDF VIA HTML TEMPLATE
  #===========================================================
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

  #===========================================================
  # CREATE — receives the form and redirects to PDF
  #===========================================================
  
def create
  # Read flat params from the standalone form
  name       = params[:name].to_s.strip
  date       = (params[:date_iso].presence || params[:date].to_s.strip) # prefer ISO if set
  time       = params[:time].to_s.strip
  typed_loc  = params[:location].to_s.strip
  place_id   = params[:place_id].to_s.strip
  place_text = params[:place_text].to_s.strip

  # Presence checks
  if name.blank? || date.blank? || typed_loc.blank?
    flash.now[:alert] = "Please fill name, birth date, and location."
    return render :new, status: :unprocessable_entity
  end

  # Optional: require a suggestion from autocomplete
  # (Uncomment if you want to force users to pick from the dropdown)
  # if place_id.blank?
  #   flash.now[:alert] = "Please choose a location from the suggestions."
  #   return render :new, status: :unprocessable_entity
  # end

  # Defaults / derived values
  time  = "12:00" if time.blank?
  place = place_text.presence || typed_loc

  # Redirect to your PDF action
  redirect_to chart_pdf_prawn_path(name: name, date: date, time: time, place: place)
end



  #===========================================================
  # DEF PRAWN — CREATES PDF DIRECTLY (NO HTML) AND SENDS DATA
  #===========================================================
  def download_prawn
    #---------------------------------------------------------
    # PARAMS / DEFAULTS
    #---------------------------------------------------------
    name  = params[:name].presence || "Ann Moloney Human Design"
    date  = params[:date].to_s
    time  = params[:time].presence || "12:00"
    place = params[:place].to_s
    tz    = params[:tz].presence || @chart&.timezone_iana || "UTC"

    #---------------------------------------------------------
    # CALL NODE CLI (BODYGRAPH + DATA) AND CAPTURE JSON OUTPUT
    #---------------------------------------------------------
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

    #---------------------------------------------------------
    # PARSE JSON (FROM NODE) → RUBY HASH
    #---------------------------------------------------------
    begin
      data = JSON.parse(out)
    rescue JSON::ParserError => e
      Rails.logger.error "[HDKIT] JSON parse error: #{e.message} | RAW: #{out[0,500]}"
      render plain: "Invalid output from chart generator", status: :bad_gateway and return
    end

    #---------------------------------------------------------
    # NORMALIZE CHART DATA (TYPE / PROFILE / AUTHORITY / SVG)
    #---------------------------------------------------------
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

    # Profile fallback from Sun/Earth lines if needed
    def line_from(rows, planet)
      v = rows.to_h[planet]
      return nil unless v
      line = v.to_s.split(".").last.to_i
      (1..6).include?(line) ? line : nil
    end
    p_line = line_from(chart[:personality_planets], "Sun")  || line_from(chart[:personality_planets], "Earth")
    d_line = line_from(chart[:design_planets],      "Sun")  || line_from(chart[:design_planets],      "Earth")
    chart[:profile] = "#{p_line}/#{d_line}" if p_line && d_line

    #---------------------------------------------------------
    # INIT PRAWN DOCUMENT (A4 + MARGINS)
    #---------------------------------------------------------
    pdf = Prawn::Document.new(page_size: "A4", margin: 36)

    #---------------------------------------------------------
    # HEADER (logo + titles)
    #---------------------------------------------------------
    font_dir = Rails.root.join("app/assets/fonts")
    font_paths = {
      normal: font_dir.join("OpenSans-Regular.ttf"),
      italic: font_dir.join("OpenSans-Italic.ttf"),
      bold:   font_dir.join("OpenSans-SemiBold.ttf")
    }
    missing = font_paths.select { |_k, p| !File.exist?(p) }
    if missing.empty?
      pdf.font_families.update(
        "Open Sans" => {
          normal: font_paths[:normal].to_s,
          italic: font_paths[:italic].to_s,
          bold:   font_paths[:bold].to_s
        }
      )
      pdf.font "Open Sans"
    end

    title_text = "HUMAN DESIGN CHART FOR"
    name_text  = name.to_s.split.map(&:capitalize).join(" ")
    formatted_date =
      begin
        Date.strptime(date.to_s, "%Y-%m-%d").strftime("%d/%m/%Y")
      rescue
        date.to_s
      end
    born_line = [formatted_date, time, place].compact.join(" | ")

    # float logo
    logo_path   = Rails.root.join("lib/hdkit/images/main-logo.png")
    logo_w      = 120
    logo_h      = 90
    logo_pad    = 8
    pdf.float do
      pdf.bounding_box([pdf.bounds.right - logo_w - logo_pad, pdf.bounds.top - logo_pad],
                       width: logo_w, height: logo_h) do
        pdf.image logo_path.to_s, at: [0, logo_h - 4], fit: [logo_w, logo_h - 8]
      end
    end

    pdf.move_down 12
    pdf.fill_color "3D78A5"
    pdf.text title_text, size: 18
    pdf.move_down 6
    pdf.fill_color "000000"
    pdf.text name_text, size: 22, style: :bold
    pdf.fill_color "444444"
    pdf.text "Born: #{born_line}", size: 10
    pdf.fill_color "000000"
    pdf.move_down 12

    #---------------------------------------------------------
    # FACTS TABLE + CROSS LINE
    #---------------------------------------------------------
    nbsp = Prawn::Text::NBSP
    require "erb"
    esc  = ->(v) { ERB::Util.h((v || "").to_s) }
    mk   = ->(title, value) { "#{title}:#{nbsp * 2}<b>#{esc.call(value)}</b>" }

    # Angle + four gates (for cross lookup)
    cross_text = chart[:cross].to_s
    angle_code =
      if    cross_text =~ /right angle/i   then "R"
      elsif cross_text =~ /juxtaposition/i then "J"
      elsif cross_text =~ /left angle/i    then "L"
      end
    def gate_from(pairs, planet_name)
      v = pairs.to_h[planet_name]
      return nil unless v
      v.to_s[/\d+/].to_i
    end
    psun   = gate_from(chart[:personality_planets], "Sun")
    pearth = gate_from(chart[:personality_planets], "Earth")
    dsun   = gate_from(chart[:design_planets],      "Sun")
    dearth = gate_from(chart[:design_planets],      "Earth")
    gates  = [psun, pearth, dsun, dearth].compact

    row =
      if angle_code && gates.size == 4 && gates.all?(&:positive?)
        IncarnationCrossIndex.find(angle: angle_code, gates: gates)
      end
    full_text =
      if row
        "(#{row.g1}/#{row.g2} | #{row.g3}/#{row.g4})".then { |sig| "#{row.description} #{sig}" }
      else
        chart[:cross]
      end

    pairs = [
      ["Type",             chart[:type]],
      ["Definition",       chart[:definition]],
      ["Strategy",         chart[:strategy]],
      ["Profile",          chart[:profile]],
      ["Inner Authority",  chart[:authority]],
      ["Not-Self Theme",   chart[:not_self]]
    ].compact

    cells = pairs.map { |title, value| mk.call(title, value) }
    cells << "" if cells.length.odd?
    rows_tbl = cells.each_slice(2).to_a
    half = pdf.bounds.width / 2.0

    pdf.table(rows_tbl,
      header: false,
      column_widths: [half, half],
      cell_style: {
        size: 12, inline_format: true, padding: [8,8,10,8],
        borders: [:top, :bottom, :left, :right], border_color: 'DDDDDD', border_width: 0.5
      }
    )

    pdf.table(
      [["Incarnation Cross:#{nbsp * 2}<b>#{esc.call(full_text)}</b>"]],
      header: false,
      column_widths: [pdf.bounds.width],
      cell_style: {
        size: 12, inline_format: true, padding: [10,8,12,8],
        borders: [:top, :bottom, :left, :right], border_color: 'DDDDDD', border_width: 0.5
      }
    )
    pdf.move_down 30

    #---------------------------------------------------------
    # THREE-COLUMN LAYOUT (DESIGN | BODYGRAPH SVG | PERSONALITY)
    #---------------------------------------------------------
    content_w = pdf.bounds.width
    gap       = 10
    left_w    = 130
    right_w   = 130
    middle_w  = content_w - left_w - right_w - gap * 2
    start_y   = pdf.cursor

    planet_order = ["Sun","Earth","Moon","North Node","South Node","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto"]
    planet_rows = ->(order, pairs) do
      h = pairs.to_h
      [["Planet","Gate.Line"]] + order.map { |p| [p, (h[p] || "")] }
    end
    glyph = {
      "Sun"=>"☉","Moon"=>"☽","Mercury"=>"☿","Venus"=>"♀","Mars"=>"♂",
      "Jupiter"=>"♃","Saturn"=>"♄","Uranus"=>"♅","Neptune"=>"♆","Pluto"=>"♇",
      "Earth"=>"♁","North Node"=>"☊","South Node"=>"☋"
    }

    # LEFT column
    pdf.bounding_box([0, start_y], width: left_w, height: 420) do
      # font for symbols
      font_path_regular = Rails.root.join("app/assets/fonts/DejaVuSans.ttf")
      font_path_bold    = Rails.root.join("app/assets/fonts/DejaVuSans-Bold.ttf")
      font_family = nil
      if File.exist?(font_path_regular)
        fam = { normal: font_path_regular.to_s }
        fam[:bold] = font_path_bold.to_s if File.exist?(font_path_bold)
        pdf.font_families.update("DejaVuSans" => fam)
        pdf.font("DejaVuSans")
        font_family = "DejaVuSans"
      end

      pdf.fill_color "F03020"
      pdf.text "Design", size: 16, align: :center

      rows = planet_rows.call(planet_order, chart[:design_planets])
      rows = rows.map.with_index { |(name, gl), i| i.zero? ? [name, gl] : [glyph[name] || name, gl] }
      rows.shift

      pdf.move_down 4
      table_w = (left_w * 0.68).to_i
      base_ix = (left_w - table_w) / 2
      indent_x = base_ix + 8
      c1 = c2 = table_w / 2

      cell_opts = { size: 9, borders: [:top, :bottom, :left, :right], border_color: "e5e5ea", padding: 4 }
      cell_opts[:font] = font_family if font_family

      pdf.indent(indent_x) do
        pdf.table rows,
          header: false, width: table_w, row_colors: %w[ffffff f8f8f8],
          column_widths: [c1, c2], cell_style: cell_opts do |t|
            t.cells.style(font: font_family) if font_family
            t.columns(0).rows(1..-1).style(text_color: "E3B157", size: 14, align: :center, font_style: :bold)
            t.columns(0).rows(0).style(text_color: "E3B157", size: 14, align: :center, font_style: :bold)
         end
      end
    end # END LEFT bounding_box

    # MIDDLE column
    pdf.bounding_box([left_w + gap, start_y], width: middle_w, height: 420) do
      pdf.svg chart[:svg].to_s, width: (middle_w - 12), position: :center, vposition: :top
    end # END MIDDLE bounding_box

    # RIGHT column
    pdf.bounding_box([left_w + gap + middle_w + gap, start_y], width: right_w, height: 420) do
      font_path_regular = Rails.root.join("app/assets/fonts/DejaVuSans.ttf")
      font_path_bold    = Rails.root.join("app/assets/fonts/DejaVuSans-Bold.ttf")
      font_family = nil
      if File.exist?(font_path_regular)
        fam = { normal: font_path_regular.to_s }
        fam[:bold] = font_path_bold.to_s if File.exist?(font_path_bold)
        pdf.font_families.update("DejaVuSans" => fam)
        pdf.font("DejaVuSans")
        font_family = "DejaVuSans"
      end

      pdf.fill_color "111111"
      pdf.text "Personality", size: 16, align: :center

      rows = planet_rows.call(planet_order, chart[:personality_planets])
      rows = rows.map.with_index { |(name, gl), i| i.zero? ? [name, gl] : [gl, (glyph[name] || name)] }
      rows.shift

      pdf.move_down 4
      table_w = (right_w * 0.68).to_i
      base_ix = (right_w - table_w) / 2
      indent_x = base_ix + 8
      c1 = c2 = table_w / 2

      cell_opts = { size: 9, borders: [:top, :bottom, :left, :right], border_color: "e5e5ea", padding: 4 }
      cell_opts[:font] = font_family if font_family

      pdf.indent(indent_x) do
        pdf.table rows,
          header: false, width: table_w, row_colors: %w[ffffff f8f8f8],
          column_widths: [c1, c2], cell_style: cell_opts do |t|
            t.cells.style(font: font_family) if font_family
            t.columns(1).rows(1..-1).style(text_color: "E3B157", size: 14, align: :center, font_style: :bold)
            t.columns(1).rows(0).style(text_color: "E3B157", size: 14, align: :center, font_style: :bold)
 
          end
      end
    end # END RIGHT bounding_box

    #---------------------------------------------------------
    # FOOTER
    #---------------------------------------------------------
    pdf.move_cursor_to 36
    pdf.stroke_color "dddddd"; pdf.stroke_horizontal_rule; pdf.move_down 4
    pdf.fill_color "666666"; pdf.text "Generated by Ann Moloney Human Design 2025   www.annmoloney.com", size: 8, align: :center
    pdf.fill_color "000000"

    #---------------------------------------------------------
    # SEND PDF
    #---------------------------------------------------------
    send_data pdf.render,
              filename: "HumanDesign_#{name.to_s.parameterize}.pdf",
              type: "application/pdf",
              disposition: (params[:download] == "1" ? "attachment" : "inline")
  end # download_prawn

  private

  # Accept params whether your form fields are top-level OR scoped under :chart.
  def chart_params
    if params[:chart].present?
      params.require(:chart).permit(:name, :date, :date_iso, :time,
                                    :location, :place_id, :place_text, :lat, :lng)
    else
      params.permit(:name, :date, :date_iso, :time,
                    :location, :place_id, :place_text, :lat, :lng)
    end
  end
end
