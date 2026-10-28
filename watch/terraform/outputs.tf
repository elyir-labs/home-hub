output "database" {
  description = "Where every check is kept, for asking by hand: npx wrangler d1 execute elyir-watch --remote --command \"...\""
  value       = cloudflare_d1_database.watch.name
}
