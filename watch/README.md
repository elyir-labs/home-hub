# The watcher

A Cloudflare Worker that checks every service we run, from outside, once a minute: the site and its promise (no script
from another site, the header that refuses one), `/install`, the pretend house, the relay, the address offer, which
houses are on this Wi-Fi, and the Houses and printer apps. When one fails two checks in a row it writes to the
operator, and it writes again when that service is back. On Monday at 08:00 UTC it sends the week in numbers: how often
each service was up and how quickly it answered, every time something went down, the relay's houses and its disk,
memory and load, how many times each page was loaded, the waitlist, and the release downloads.

It reads only what our own services already see, and nothing about a visitor or a house (AGENTS.md, section 5). It
runs on Cloudflare, which already serves the site, so it adds no new company.

## The page

Between Mondays, the numbers are on one page at `watch.elyir.com` (`page.js`; design/watch, A's rows with B's chart
under them). It answers whether everything is up, then shows each service's last seven days, the week's numbers and the
relay's box, then page loads by week and which pages. Only the operator gets in: Cloudflare Access asks for a code
sent to `alert_to`, and the Worker checks Access's signed token itself, so it refuses rather than shows if Access is
ever set wider. The page runs no script and loads nothing but the site's own font. It reads an hourly roll-up of the
checks (`hours`), so a view reads a few hundred rows rather than a week of minutes; the hours fill in from the first
apply, and the marks before that stay empty.

To see it without Cloudflare, `node --test watch/page.test.mjs` pins it to the board, and `render(shape(...))` from
`page.js` draws it from any numbers.

The relay's numbers come from its `/alive`, which answers the watcher's key with counts and says only `ok` to
anybody else (`relay/service/app.py`). The key is `sha256("watch:<relay token>")`, worked out here and by the
service, so the relay box needs nothing new.

## Making it

Apply `site/terraform` first: it makes the page counts' database, which this reads.

The mailbox it writes to must already be an Email Routing destination, set up through `email_forwards` in
`relay/terraform` and confirmed once by its owner. Then, with a token in the environment (the
permissions are listed in `terraform/versions.tf`):

```sh
export CLOUDFLARE_API_TOKEN=...
cd watch/terraform
cat > terraform.tfvars <<'VARS'      # ignored by git
account_id       = "..."
alert_to         = "you@example.com"
relay_auth_token = "..."             # the same as relay/terraform's
access_team      = "..."             # the account's Zero Trust team: <name>.cloudflareaccess.com
VARS
terraform init && terraform plan && terraform apply
```

An account has one Zero Trust team, shared by every project on it, so this uses the team and never changes it. An
account that has never had one turns Zero Trust on once (Zero Trust in the dashboard, the Free plan), which chooses the
name; Cloudflare offers no way to do that from Terraform. On 2 November 2026 an account-owned token with the
Access permissions was refused them; a user's own token (My Profile > API Tokens) with the same ones worked.

An account has one code-by-email login too. If it already has one, bring it in before the first apply:

```sh
terraform import cloudflare_zero_trust_access_identity_provider.code "<account_id>/<identity provider id>"
```

A change to `worker.js` goes up with the next `terraform apply`. The judgment is tested by `watch.test.mjs`. The
minute loop and the mail are seen working only on the real thing, so after an apply, check that the first rows
arrive:

```sh
npx wrangler d1 execute elyir-watch --remote --command "SELECT name, ok, ms, why FROM checks ORDER BY at DESC LIMIT 9"
```
