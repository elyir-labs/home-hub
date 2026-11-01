output "page" {
  description = "The watcher's page. Access asks for a code sent to alert_to."
  value       = "https://${cloudflare_workers_custom_domain.watch.hostname}"
}

output "database" {
  description = "Where every check is kept, for asking by hand: npx wrangler d1 execute elyir-watch --remote --command \"...\""
  value       = cloudflare_d1_database.watch.name
}
