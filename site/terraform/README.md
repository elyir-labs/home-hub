# hub.elyir.com

Elyir Home Hub's site: the front page (`site/index.html`, design/site's D), `/install` and the waitlist. This folder
makes the things it runs on, once; `.github/workflows/site.yml` deploys the page on every change to `main`.

What it makes:

- the Pages project `elyir-home-hub`, served at `hub.elyir.com` (a proxied CNAME in the `elyir.com` zone);
- the D1 database `elyir-waitlist`, bound to the project as `WAITLIST`. It is the one Elyir waitlist, with the product
  a column, so Elyir Bench's site can bind it too. `functions/waitlist.js` makes its one table on first use.

- the deploy workflow's own token (`deploy.tf`): the account's, able only to upload Pages, written with the account's
  id into the repository's Actions secrets. Nobody makes either by hand.

To apply, with a token in the environment (Account > Cloudflare Pages > Edit, Account > D1 > Edit, Account > Account
API Tokens > Edit, Zone > DNS > Edit on `elyir.com`) and a GitHub token that can write the repository's secrets:

```sh
export CLOUDFLARE_API_TOKEN=...
export GITHUB_TOKEN=$(gh auth token)
cd site/terraform
echo 'account_id = "..."' > terraform.tfvars     # ignored by git
terraform init && terraform plan && terraform apply
```

The state stays on the machine that applied it, as the relay's does, and now holds the deploy token: keep it as you
would the token. Replacing the token is `terraform apply -replace=cloudflare_account_token.deploy`, which rewrites the
secret in the same run.

Reading the list: `npx wrangler d1 execute elyir-waitlist --remote --command "SELECT product, count(*) FROM signups GROUP BY product"`.
