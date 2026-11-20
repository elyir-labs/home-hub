# The paintings the screens show (design/tv-art/, brain/hub/art.py): a bucket of pictures we prepared from museums'
# public-domain collections, served at art.<zone_name>. Every hub downloads the set from here, once, when one of its
# screens turns art on; nothing else reads it. tools/art/prepare.py --publish fills it. A file's name is its hash, so
# nothing in it is ever changed in place.
resource "cloudflare_r2_bucket" "art" {
  account_id = var.account_id
  name       = "elyir-art"
  location   = "enam"
}

resource "cloudflare_r2_custom_domain" "art" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.art.name
  domain      = "art.${var.zone_name}"
  zone_id     = data.cloudflare_zone.site.zone_id
  enabled     = true
  min_tls     = "1.2"
}
