# The database (Azure SQL)

Ordo's saints live in an Azure SQL database (`machina` on `sql-machina-<suffix>`,
see `infra/main.bicep`). Visitors never query it: a daily job publishes what the
site needs as JSON, so it sleeps nearly all the time and stays inside the free
offer.

## Migrations

Every change to the database's shape or seed data is a numbered file in
`migrations/`, such as `0001_schema.sql`. The deploy applies the ones not yet
applied, in number order, each in its own transaction, and records them in
`dbo.schema_migrations` with a checksum.

- **Never edit a migration that has been applied.** The runner refuses to go on
  if one changed. Make the next change a new, higher-numbered file.
- Separate batches with a line holding only `GO` (needed before `CREATE VIEW`
  and similar statements).
- `$(NAME)` placeholders are filled from `SQLVAR_NAME` environment variables
  (the deploy passes `FUNC_IDENTITY_NAME` and `FUNC_IDENTITY_PRINCIPAL_ID`).

Rehearse before merging. With the Azure CLI signed in as a member of
`sql-machina-admins`:

```bash
cd functions
SQL_SERVER=<server>.database.windows.net SQL_DATABASE=machina \
  SQLVAR_FUNC_IDENTITY_NAME=id-machina-func SQLVAR_FUNC_IDENTITY_PRINCIPAL_ID=<id> \
  node scripts/migrate.js --dry-run
```

A dry run applies every pending migration inside one transaction and then rolls
it all back, so it proves the SQL works against the real database without
keeping anything. Your machine's address must be allowed through the server's
firewall for the duration (Azure portal → the SQL server → Networking, or
`az sql server firewall-rule create`).

## Signing in

Entra only; there are no SQL passwords. The server's admin is the Entra group
`sql-machina-admins` (the owner and the GitHub deploy identity), managed by hand
so CI can't widen its own access. The Function app signs in as its managed
identity `id-machina-func`, which a migration makes a read-only user.
