terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.25"
    }
  }
}

# The token comes from CLOUDFLARE_API_TOKEN in the environment: never a variable, never in state, never in this
# repository. It needs Account > Workers Scripts > Edit, Account > D1 > Edit, Account > Access: Apps and Policies > Edit,
# Account > Access: Organizations, Identity Providers, and Groups > Edit, Zone > Workers Routes > Edit and Zone > Zone > Read.
provider "cloudflare" {}
