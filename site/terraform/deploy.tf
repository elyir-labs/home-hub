# The deploy workflow's own credentials, made here so nobody makes them by hand. Without them the workflow builds and
# tests every change and uploads none of it: after the move to elyir-labs on 18 October the site stood still for ten
# days on green runs. The token is the account's, not a person's, and can only upload Pages: nothing in DNS or D1.
data "cloudflare_account_api_token_permission_groups_list" "pages_write" {
  account_id = var.account_id
  name       = "Pages Write" # plain: the provider encodes it, and the documented %20 arrives as %2520
}

resource "cloudflare_account_token" "deploy" {
  account_id = var.account_id
  name       = "${var.project_name} deploy (GitHub Actions, ${var.github_owner}/${var.github_repository})"

  lifecycle {
    precondition {
      condition     = length(data.cloudflare_account_api_token_permission_groups_list.pages_write.result) == 1
      error_message = "Expected exactly one permission group named Pages Write; Cloudflare may have renamed it."
    }
  }

  policies = [{
    effect            = "allow"
    permission_groups = [for group in data.cloudflare_account_api_token_permission_groups_list.pages_write.result : { id = group.id }]
    resources         = jsonencode({ "com.cloudflare.api.account.${var.account_id}" = "*" })
  }]
}

resource "github_actions_secret" "token" {
  repository  = var.github_repository
  secret_name = "CLOUDFLARE_API_TOKEN"
  value       = cloudflare_account_token.deploy.value
}

resource "github_actions_secret" "account" {
  repository  = var.github_repository
  secret_name = "CLOUDFLARE_ACCOUNT_ID"
  value       = var.account_id
}
