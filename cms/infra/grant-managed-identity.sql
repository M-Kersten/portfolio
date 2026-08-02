-- Give the CMS's managed identity access to the draft database.
--
-- The Bicep gets the app as far as authenticating with its identity, but a
-- managed identity is not a database user until someone says so, and that grant
-- cannot be made from ARM — it is a data-plane operation. So this is the one
-- manual step in the deployment.
--
-- IMPORTANT: the name in brackets is the App Service's name, because that is
-- also its managed identity's display name. This file assumes the default. If
-- the `name` parameter was changed, take the exact text from the deployment
-- instead of editing this by hand:
--
--   az deployment group show -g Default -n main \
--     --query properties.outputs.grantSql.value -o tsv
--
-- Getting the name wrong does not error — it creates a user for a principal
-- that is not the app, and the app then fails to start with a login failure
-- that points nowhere near this file.
--
-- Run against the CMS database (not master), signed in as the server's
-- Microsoft Entra admin. The portal's Query editor is the easiest way:
--
--   Azure portal → <name>-db → Query editor → "Continue as <you>"

CREATE USER [merijn-cms] FROM EXTERNAL PROVIDER;

-- Read and write the content rows.
ALTER ROLE db_datareader ADD MEMBER [merijn-cms];
ALTER ROLE db_datawriter ADD MEMBER [merijn-cms];

-- Create the tables. The app calls EnsureCreated() on start-up rather than
-- running migrations, so it needs to be able to make the schema on first run.
-- db_ddladmin is the narrow role for that — db_owner would also work and grants
-- considerably more than this app has any reason to hold.
ALTER ROLE db_ddladmin ADD MEMBER [merijn-cms];

-- Verify:
--   SELECT name, type_desc FROM sys.database_principals WHERE type = 'E';
-- Expect the app's name, EXTERNAL_USER.
