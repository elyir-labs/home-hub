# The watcher

A Cloudflare Worker that checks every service we run, from outside, once a minute: the site and its promise (no script
from another site, the header that refuses one), `/install`, the pretend house, the relay, the address offer, which
houses are on this Wi-Fi, and the Houses and printer apps. When one fails two checks in a row it writes to the
operator, and it writes again when that service is back. On Monday at 08:00 UTC it sends the week in numbers: how often
each service was up and how quickly it answered, every time something went down, the relay's houses and its disk,
memory and load, the waitlist, and the release downloads.

It reads only what our own services already see, and nothing about a visitor or a house (AGENTS.md, section 5). It
runs on Cloudflare, which already serves the site, so it adds no new company. It has no address of its own: nothing
calls it, it only calls out.

The relay's numbers come from its `/alive`, which answers the watcher's key with counts and says only `ok` to
anybody else (`relay/service/app.py`). The key is `sha256("watch:<relay token>")`, worked out here and by the
service, so the relay box needs nothing new.

## Making it

The mailbox it writes to must already be an Email Routing destination, set up through `email_forwards` in
`relay/terraform` and confirmed once by its owner. Then, with a token in the environment (Account > Workers Scripts >
Edit, Account > D1 > Edit):

```sh
export CLOUDFLARE_API_TOKEN=...
cd watch/terraform
cat > terraform.tfvars <<'VARS'      # ignored by git
account_id       = "..."
alert_to         = "you@example.com"
relay_auth_token = "..."             # the same as relay/terraform's
VARS
terraform init && terraform plan && terraform apply
```

A change to `worker.js` goes up with the next `terraform apply`. The judgment is tested by `watch.test.mjs`. The
minute loop and the mail are seen working only on the real thing, so after an apply, check that the first rows
arrive:

```sh
npx wrangler d1 execute elyir-watch --remote --command "SELECT name, ok, ms, why FROM checks ORDER BY at DESC LIMIT 9"
```
