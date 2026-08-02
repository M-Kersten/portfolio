// Azure resources for the portfolio CMS.
//
// Everything here is chosen to sit inside a permanently free tier, not a trial:
// App Service F1 is free indefinitely, and the Azure SQL free offer grants
// 100,000 vCore-seconds and 32GB per database for the lifetime of the
// subscription. Blob storage is the only thing that bills, and at ~1.2MB of
// posters it rounds to nothing.
//
// The SQL *server* is not created here — it is expected to exist already, and
// is passed in by name. Servers are the thing people tend to create by hand
// first (and the thing that is painful to recreate, since the admin login is
// set at creation), so adopting one is the more useful default. The database on
// it is created here, because that is where the free-tier flag lives.
//
// No credentials are passed in or stored anywhere: the app reaches both SQL and
// blob storage with its system-assigned managed identity. The one thing that
// cannot be done from here is making that identity a database user — see
// grant-managed-identity.sql.
//
// Deploy with:
//   az deployment group create -g Default -f cms/infra/main.bicep \
//      -p location=germanywestcentral sqlServerName=merijndatabasegermany

@description('Short name used as the prefix for every resource.')
param name string = 'merijn-cms'

@description('''
Region. Must be one where the Azure SQL free offer is available, and the same
region as the SQL server — a database cannot live in a different region from
its server. The App Service free tier allows one F1 plan per region per
subscription.
''')
param location string = resourceGroup().location

@description('Name of the existing SQL server, which must be in this resource group.')
param sqlServerName string

// Storage account names are globally unique, lowercase and alphanumeric only.
var storageName = toLower(replace('${name}st${uniqueString(resourceGroup().id)}', '-', ''))
var posterContainer = 'pending-posters'
// Named through a variable rather than read off the resource, so the app's
// connection string doesn't create a reference cycle with the database.
var databaseName = '${name}-db'

// ── Hosting ──────────────────────────────────────────────────────────────────

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${name}-plan'
  location: location
  kind: 'linux'
  sku: {
    // F1 is free forever. It has no Always On, so the app cold-starts after
    // idling — fine for a tool opened a few times a month, and the site itself
    // is static on GitHub Pages so nothing user-facing depends on this being
    // warm. B1 (~EUR 12/mo) is the upgrade if the cold start becomes annoying.
    name: 'F1'
    tier: 'Free'
  }
  properties: {
    reserved: true // Linux
  }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: name
  location: location
  // The connection string names the database through a variable, so the
  // ordering has to be stated: the app creates its schema on first start.
  dependsOn: [sqlDatabase]
  identity: {
    // Used to reach blob storage without a key in configuration.
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      // Not available on F1 — left off explicitly so the intent is clear rather
      // than looking like an oversight.
      alwaysOn: false
      appSettings: [
        { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
        { name: 'Storage__ServiceUri', value: storage.properties.primaryEndpoints.blob }
        { name: 'Storage__Container', value: posterContainer }
        // The remaining settings hold secrets and are set after deployment:
        //   GitHub__Token, AzureAd__ClientId, AzureAd__TenantId,
        //   Cms__AllowedUsers__0
        // See docs/cms.md.
      ]
      connectionStrings: [
        {
          name: 'Cms'
          type: 'SQLAzure'
          // No credentials: the app authenticates to SQL with the same
          // system-assigned identity it uses for blob storage. "Active Directory
          // Default" resolves to the managed identity on App Service and to the
          // signed-in az/VS account locally, so the same string works in both
          // places. It also means nothing secret is stored in configuration —
          // and the server can keep Entra-only authentication, which leaves no
          // password to leak in the first place.
          //
          // The identity still needs a database user; that is a one-time grant
          // that cannot be done from ARM. See infra/grant-managed-identity.sql.
          connectionString: 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Database=${databaseName};Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;Connection Timeout=60;'
        }
      ]
    }
  }
}

// ── Draft database ───────────────────────────────────────────────────────────

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' existing = {
  name: sqlServerName
}

// App Service outbound IPs are not fixed on the free tier, so the app reaches
// SQL through the "allow Azure services" rule rather than a pinned range. The
// database holds drafts of content that is public anyway, and the admin login
// is still required.
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: databaseName
  location: location
  sku: {
    // Serverless General Purpose is the only tier the free offer applies to.
    name: 'GP_S_Gen5'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 2
  }
  properties: {
    // The free offer: 100,000 vCore-seconds and 32GB a month, for the lifetime
    // of the subscription. This flag is the whole difference between free and
    // billed — provisioning without it lands on a paid tier.
    useFreeLimit: true
    // When the monthly allowance runs out, stop rather than start charging.
    freeLimitExhaustionBehavior: 'AutoPause'
    autoPauseDelay: 60
    minCapacity: json('0.5')
    maxSizeBytes: 34359738368 // 32GB, the free ceiling
    zoneRedundant: false
  }
}

// ── Poster staging ───────────────────────────────────────────────────────────

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource posters 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: posterContainer
  properties: {
    // Posters live here only between upload and publish; the artwork the site
    // serves is the committed file, so nothing needs public read.
    publicAccess: 'None'
  }
}

// Storage Blob Data Contributor, scoped to this account, for the app's identity.
var blobContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)

resource posterAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, app.id, blobContributor)
  properties: {
    roleDefinitionId: blobContributor
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output appUrl string = 'https://${app.properties.defaultHostName}'
output appName string = app.name
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDatabase.name
output storageAccount string = storage.name

@description('Redirect URI to register on the Entra app registration.')
output entraRedirectUri string = 'https://${app.properties.defaultHostName}/signin-oidc'
