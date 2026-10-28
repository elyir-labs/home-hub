variable "account_id" {
  description = "The Cloudflare account the site and the relay's names live in. Set TF_VAR_account_id, or terraform.tfvars."
  type        = string
}

variable "alert_to" {
  description = <<-EOT
    The mailbox the watcher writes to. It must already be one of Email Routing's destinations, which relay/terraform's
    email_forwards makes and its owner confirms once: Cloudflare sends from a Worker only to a mailbox that said yes.
  EOT
  type        = string
}

variable "alert_from" {
  description = "Who the watcher writes as: an address on a zone with Email Routing on. Nothing is received there."
  type        = string
  default     = "watch@elyir.app"
}

variable "relay_auth_token" {
  description = <<-EOT
    The relay's token, the same value as relay/terraform's. Only a key derived from it reaches the Worker, the one the
    relay's /alive answers with its numbers (relay/service/app.py, watch_key); the token itself stays here.
  EOT
  type        = string
  sensitive   = true
}

variable "repository" {
  description = "Whose releases the Monday note counts downloads of."
  type        = string
  default     = "elyir-labs/home-hub"
}
