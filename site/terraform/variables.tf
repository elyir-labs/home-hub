variable "account_id" {
  description = "The Cloudflare account the site and the list live in. Set TF_VAR_account_id, or terraform.tfvars."
  type        = string

  # Every resource here is keyed on it, so a wrong value plans to destroy and remake the lot, the waitlist included.
  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id is 32 hex characters (npx wrangler whoami prints it), not a placeholder."
  }
}

variable "zone_name" {
  description = <<-EOT
    Where the hub's site is: hub.<zone_name> (design/site, D; the address follows Elyir Bench's U1). The company keeps
    the zone's apex, and Elyir Bench is bench.<zone_name>. Not elyir.app: names there are houses' own addresses.
  EOT
  type        = string
  default     = "elyir.com"
}

variable "project_name" {
  description = "The Pages project. Also its free address: <project_name>.pages.dev."
  type        = string
  default     = "elyir-home-hub"
}

variable "github_owner" {
  description = "Where the deploy workflow runs: its repository's owner on GitHub."
  type        = string
  default     = "elyir-labs"
}

variable "github_repository" {
  description = "The repository whose workflow deploys the site, and is given its token."
  type        = string
  default     = "home-hub"
}
