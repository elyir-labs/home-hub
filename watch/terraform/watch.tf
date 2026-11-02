# The maker's watcher (watch/worker.js): every minute it checks what we run from outside and writes to the operator
# when something stops answering; on Monday mornings it sends the week in numbers. On Cloudflare because the site
# already is, so watching adds no company to the list. Its one page, the numbers between Mondays (design/watch), is at
# watch.<zone_name>, and only the operator gets in: Cloudflare Access asks for a code sent to alert_to.

locals {
  weekly = "0 8 * * 1" # Monday 08:00 UTC
}

resource "cloudflare_d1_database" "watch" {
  account_id = var.account_id
  name       = "elyir-watch"

  # Said out loud because the API always reports it, and left unsaid every plan would offer to change the database.
  read_replication = {
    mode = "disabled"
  }
}

# The one Elyir waitlist (site/terraform), read for how many joined. Read only by what the Worker asks of it.
data "cloudflare_d1_database" "waitlist" {
  account_id = var.account_id
  filter = {
    name = "elyir-waitlist"
  }
}

# The site's page counts (site/terraform), read the same way.
data "cloudflare_d1_database" "counts" {
  account_id = var.account_id
  filter = {
    name = "elyir-site-counts"
  }
}

resource "cloudflare_workers_script" "watch" {
  account_id     = var.account_id
  script_name    = "elyir-watch"
  content_file   = "${path.module}/../worker.js"
  content_sha256 = filesha256("${path.module}/../worker.js")
  main_module    = "worker.js"
  files = {
    "page.js" = { content_file = "${path.module}/../page.js", content_type = "application/javascript+module" }
  }
  compatibility_date = "2026-10-01"

  bindings = [
    { type = "d1", name = "DB", id = cloudflare_d1_database.watch.id },
    { type = "d1", name = "WAITLIST", id = data.cloudflare_d1_database.waitlist.database_id },
    { type = "d1", name = "COUNTS", id = data.cloudflare_d1_database.counts.database_id },
    { type = "send_email", name = "MAIL", destination_address = var.alert_to },
    { type = "secret_text", name = "RELAY_KEY", text = sha256("watch:${var.relay_auth_token}") },
    { type = "plain_text", name = "TO", text = var.alert_to },
    { type = "plain_text", name = "FROM", text = var.alert_from },
    { type = "plain_text", name = "WEEKLY", text = local.weekly },
    { type = "plain_text", name = "REPOSITORY", text = var.repository },
    { type = "plain_text", name = "ACCESS_TEAM", text = cloudflare_zero_trust_organization.team.auth_domain },
    { type = "plain_text", name = "ACCESS_AUD", text = cloudflare_zero_trust_access_application.watch.aud },
  ]
}

# Off: the page is answered only at its own address, where Access stands in front of it.
resource "cloudflare_workers_script_subdomain" "watch" {
  account_id       = var.account_id
  script_name      = cloudflare_workers_script.watch.script_name
  enabled          = false
  previews_enabled = false
}

resource "cloudflare_workers_cron_trigger" "watch" {
  account_id  = var.account_id
  script_name = cloudflare_workers_script.watch.script_name
  schedules = [
    { cron = "* * * * *" },
    { cron = local.weekly },
  ]
}
