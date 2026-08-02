-- Give the CMS's managed identity access to the draft database.
--
-- The Bicep gets the app as far as authenticating with its system-assigned
-- identity, but a managed identity is not a database user until someone says
-- so, and that grant cannot be made from ARM — it is a data-plane operation.
-- So this is the one manual step in the deployment.
--
-- Run it against merijn-cms-db (not master) as the server's Microsoft Entra
-- admin. The portal's Query editor is the easiest way: SQL database →
-- Query editor → "Continue as <you>".
--
--   Azure portal → merijn-cms-db → Query editor (preview)
--
-- The name in brackets is the App Service's name, which is also its identity's
-- display name. Change it here if the app is ever renamed.

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
--   SELECT name, type_desc FROM sys.database_principals WHERE name = 'merijn-cms';
-- Expect one row, EXTERNAL_USER.
