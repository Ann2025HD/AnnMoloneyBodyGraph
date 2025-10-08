# config/initializers/content_security_policy.rb
if Rails.env.production?
  Rails.application.config.content_security_policy do |p|
    p.default_src :self

    # Allow Google Maps/Places JS + polyfills
    p.script_src  :self, "https://maps.googleapis.com", "https://maps.gstatic.com", "https://polyfill.io", :unsafe_inline

    # XHR/fetch used by Places
    p.connect_src :self, "https://maps.googleapis.com"

    # Fonts & styles Google uses
    p.style_src   :self, "https://fonts.googleapis.com", :unsafe_inline
    p.font_src    :self, "https://fonts.gstatic.com", :data

    # Images/icons from Google + data URIs
    p.img_src     :self, :data, "https://maps.gstatic.com", "https://maps.googleapis.com"

    # Let your WP site embed the app (iframe)
    p.frame_ancestors "https://annmoloney.com", "https://www.annmoloney.com"
  end

  # Remove the legacy header so CSP controls framing
  Rails.application.config.action_dispatch.default_headers.delete("X-Frame-Options")
end
