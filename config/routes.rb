Rails.application.routes.draw do
  # ---- Charts (form + submit + PDFs) ----
  get  "charts/new", to: "charts#new",    as: :new_chart
  post "charts",     to: "charts#create", as: :charts
  get  "charts",     to: redirect("/charts/new")
  get "/charts_prawn.pdf", to: "charts#download_prawn", as: :chart_pdf_prawn
  get "/charts.pdf",       to: "charts#download",       as: :chart_pdf

end
