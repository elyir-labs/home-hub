# The watcher's page is for the operator alone. Cloudflare Access stands in front of watch.<zone_name> and lets in only
# alert_to, after a code sent there; the Worker checks Access's signed token as well (worker.js, signedIn), so nothing
# is shown if this ever lets too much through. Access is on the account the site already uses: no new company.

data "cloudflare_zone" "watch" {
  filter = {
    name = var.zone_name
  }
}

resource "cloudflare_workers_custom_domain" "watch" {
  account_id = var.account_id
  zone_id    = data.cloudflare_zone.watch.zone_id
  hostname   = "watch.${var.zone_name}"
  service    = cloudflare_workers_script.watch.script_name
}

# The account's Zero Trust team is not made or changed here: an account has one, other projects on it sign in through
# it too, and managing it would rename theirs and reset its settings. The watcher only needs its sign-in address.
locals {
  access_team = "${var.access_team}.cloudflareaccess.com"
}

# A state that once held the team lets go of it without deleting it.
removed {
  from = cloudflare_zero_trust_organization.team
  lifecycle {
    destroy = false
  }
}

# A code by email: no password to keep and no other company to sign in with.
resource "cloudflare_zero_trust_access_identity_provider" "code" {
  account_id = var.account_id
  name       = "A code by email"
  type       = "onetimepin"
  config     = {}
}

resource "cloudflare_zero_trust_access_policy" "operator" {
  account_id       = var.account_id
  name             = "The operator"
  decision         = "allow"
  session_duration = "24h"
  include = [
    { email = { email = var.alert_to } },
  ]
}

resource "cloudflare_zero_trust_access_application" "watch" {
  account_id                = var.account_id
  name                      = "Elyir watch"
  type                      = "self_hosted"
  destinations              = [{ type = "public", uri = "watch.${var.zone_name}" }]
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.code.id]
  auto_redirect_to_identity = true
  app_launcher_visible      = false
  session_duration          = "24h"
  policies = [
    { id = cloudflare_zero_trust_access_policy.operator.id, precedence = 1 },
  ]
}
