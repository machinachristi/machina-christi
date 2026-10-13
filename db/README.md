# The database (Azure SQL)

Ordo's saints live in an Azure SQL database (`machina` on
`sql-machina-cus-<suffix>`, Central US; created by `infra/bootstrap.bicep`).
Visitors never query it: a job publishes what the site needs as JSON when the
data changes, and weekly, so it sleeps nearly all the time and stays inside the
free offer.

## Migrations

Every change to the database's shape or seed data is a numbered file in
`migrations/`, such as `0001_schema.sql`. The deploy applies the ones not yet
applied, in number order, each in its own transaction, and records them in
`dbo.schema_migrations` with a checksum.

- **Never edit a migration that has been applied.** The runner refuses to go on
  if one changed. Make the next change a new, higher-numbered file.
- Separate batches with a line holding only `GO` (needed before `CREATE VIEW`
  and similar statements).
- `$(NAME)` placeholders are filled from `SQLVAR_NAME` environment variables.

Rehearse before merging. With the Azure CLI signed in as a member of
`sql-machina-admins`:

```bash
cd functions
SQL_SERVER=sql-machina-cus-<suffix>.database.windows.net SQL_DATABASE=machina \
  node scripts/migrate.js --dry-run
```

A dry run applies every pending migration inside one transaction and then rolls
it all back, so it proves the SQL works against the real database without
keeping anything. Your machine's address must be allowed through the server's
firewall for the duration (Azure portal → the SQL server → Networking, or
`az sql server firewall-rule create`).

## Who may do what

Entra only; there are no SQL passwords.

| Who | Where it's set | May |
|---|---|---|
| `sql-machina-admins` (people: the owner) | `infra/bootstrap.bicep` (by hand) | Everything: the server's admin |
| `id-machina-github-deploy` (CI on `main`) | `bootstrap.sql` | Create and change tables and their data (`db_ddladmin`, `db_datareader`, `db_datawriter`). Not users, permissions, or the server |
| `id-machina-func` (the API) | `bootstrap.sql` | Read (`api_reader`: `SELECT` on schema `dbo`, so new tables are covered) |

`bootstrap.sql` is run once by an admin, and again only when it changes. It's
safe to re-run:

```bash
cd functions
SQL_SERVER=sql-machina-cus-<suffix>.database.windows.net SQL_DATABASE=machina \
  SQLVAR_DEPLOY_IDENTITY_NAME=id-machina-github-deploy SQLVAR_FUNC_IDENTITY_NAME=id-machina-func \
  node scripts/migrate.js --bootstrap
```

It prints each Entra user and its roles when done. Migrations never create
users or grant permissions (the deploy identity can't), so access changes always
go through this file and a person.
