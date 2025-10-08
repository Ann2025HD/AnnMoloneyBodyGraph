if Rails.env.production?
  Rails.application.config.content_security_policy do |policy|
    # Allow your WP site(s) to embed your app in an iframe
    policy.frame_ancestors :self,
      "https://annmoloney.com",
      "https://www.annmoloney.com"
  end

  # Remove the legacy header so CSP controls framing
  Rails.application.config.action_dispatch.default_headers.delete("X-Frame-Options")
end
