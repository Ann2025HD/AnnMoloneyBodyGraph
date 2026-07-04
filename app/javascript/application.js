// Configure your import map in config/importmap.rb. Read more: https://github.com/rails/importmap-rails
import "@hotwired/turbo-rails"
import "controllers"

(function(w,d,e,u,f,l,n){
  w[f]=w[f]||function(){
    (w[f].q=w[f].q||[]).push(arguments);
  };
  l=d.createElement(e);
  l.async=1;
  l.src=u;
  n=d.getElementsByTagName(e)[0];
  n.parentNode.insertBefore(l,n);
})(window,document,'script','https://assets.mailerlite.com/js/universal.js','ml');

ml('account', '1270515');