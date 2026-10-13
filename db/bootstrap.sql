-- One-time setup of who may do what inside the database. Run by a person
-- (a member of sql-machina-admins), never by CI:
--
--   cd functions && node scripts/migrate.js --bootstrap
--
-- Safe to run again: each step checks first. See db/README.md.

-- The deploy robot (GitHub Actions on main) applies migrations: it may create
-- and change tables and their data, and nothing else. It can't create users,
-- grant permissions, or touch other databases or the server.
IF DATABASE_PRINCIPAL_ID('$(DEPLOY_IDENTITY_NAME)') IS NULL
  CREATE USER [$(DEPLOY_IDENTITY_NAME)] FROM EXTERNAL PROVIDER;
ALTER ROLE db_ddladmin ADD MEMBER [$(DEPLOY_IDENTITY_NAME)];
ALTER ROLE db_datareader ADD MEMBER [$(DEPLOY_IDENTITY_NAME)];
ALTER ROLE db_datawriter ADD MEMBER [$(DEPLOY_IDENTITY_NAME)];

-- The API (the Function app's identity) only reads: the daily publish job
-- turns the tables into the JSON the site uses.
IF DATABASE_PRINCIPAL_ID('$(FUNC_IDENTITY_NAME)') IS NULL
  CREATE USER [$(FUNC_IDENTITY_NAME)] FROM EXTERNAL PROVIDER;
IF DATABASE_PRINCIPAL_ID('api_reader') IS NULL
  CREATE ROLE api_reader;
-- On the whole dbo schema, so tables added by later migrations are covered.
GRANT SELECT ON SCHEMA::dbo TO api_reader;
ALTER ROLE api_reader ADD MEMBER [$(FUNC_IDENTITY_NAME)];
