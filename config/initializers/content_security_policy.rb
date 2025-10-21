# config/initializers/content_security_policy.rb

# --- Production CSP (enforced) ---
if Rails.env.production?
  Rails.application.config.content_security_policy do |p|
    p.default_src :self

    maps = ["https://maps.googleapis.com", "https://maps.gstatic.com"]
    cdns = ["https://polyfill.io", "https://unpkg.com"]

    p.script_src :self, :https, *maps, *cdns
    p.connect_src :self, :https, *maps, "https://unpkg.com"
    p.img_src     :self, :https, :data, *maps
    p.style_src   :self, :https, "https://fonts.googleapis.com", :unsafe_inline
    p.font_src    :self, :https, :data, "https://fonts.gstatic.com"

    # Allow your WordPress site to embed this app (iframe)
    p.frame_ancestors "https://annmoloney.com", "https://www.annmoloney.com"
  end

  # Nonces for inline/module scripts (if you use them in prod)
  Rails.application.config.content_security_policy_nonce_generator =
    ->(_req) { SecureRandom.base64(16) }

  # Let CSP (not X-Frame-Options) control framing
  Rails.application.config.action_dispatch.default_headers.delete("X-Frame-Options")
end

# --- Development: NO CSP (remove headers) ---
if Rails.env.development?
  # Ensure no CSP headers are sent in dev
  Rails.application.config.action_dispatch.default_headers.delete("Content-Security-Policy")
  Rails.application.config.action_dispatch.default_headers.delete("Content-Security-Policy-Report-Only")
end
