terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.25"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.6"
    }
  }
}

# The token comes from CLOUDFLARE_API_TOKEN in the environment: never a variable, never in state, never in this
# repository. It needs Account > Cloudflare Pages > Edit, Account > D1 > Edit, Account > Account API Tokens > Edit (to
# make the deploy workflow's token) and Zone > DNS > Edit on elyir.com.
provider "cloudflare" {}

# The same rule: GITHUB_TOKEN in the environment (`gh auth token` will do), able to write the repository's secrets.
provider "github" {
  owner = var.github_owner
}
