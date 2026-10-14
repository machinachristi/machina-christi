// Machina Christi platform: everything inside rg-machina-platform.
// GitHub Actions applies this file on every merge to main. By hand:
//
//   az deployment group create -g rg-machina-platform -n machina-platform \
//     -f infra/main.bicep
//
// No secrets anywhere. The Function app reaches storage and Application
// Insights with its own managed identity, so there are no keys or connection
// strings to leak or rotate.
targetScope = 'resourceGroup'

param location string = resourceGroup().location

@description('Region for the API and its private network: the database\'s region (Central US), since a SQL virtual network rule admits only subnets in the server\'s own region.')
param apiLocation string = 'centralus'

@description('Stable suffix for names that must be unique across all of Azure (storage, function app).')
param suffix string = take(uniqueString(resourceGroup().id), 6)

@description('Public hostname for the API. Cloudflare proxies it (DNS: a proxied CNAME to the Function app, plus the asuid TXT record that proves ownership). TLS to Azure uses its own certificate; Cloudflare terminates the public one.')
param apiHostname string = 'api.machinachristi.com'

@description('Browser origins allowed to call the API.')
param allowedOrigins array = [
  'https://machinachristi.com'
  'https://www.machinachristi.com'
]

// Two Log Analytics workspaces, each with a hard daily cap. Together they stay
// inside the 5 GB a month free allowance (which they share): 0.10 + 0.05 GB a
// day is about 4.6 GB a month.
@description('Daily ingestion cap in GB for the API\'s workspace (log-machina).')
param logDailyCapGb string = '0.10'

@description('Daily ingestion cap in GB for the browser\'s workspace (log-machina-web). About 50 MB: hundreds of times today\'s real traffic.')
param webLogDailyCapGb string = '0.05'

@description('Most Function instances that may run at once. One is plenty for today\'s traffic and caps how fast a flood could use up the free grant; raise it once Cloudflare rate-limits the API.')
@minValue(1)
param maxInstances int = 1

var tags = {
  project: 'machina-christi'
  managedBy: 'bicep'
}

// The roles granted below. CI may grant exactly the roles in this file (see
// modules/ci-access.bicep), so a new one is added there and bootstrap re-run.
var roles = loadJsonContent('platform-roles.json')

// What the Functions host needs from its storage account: blobs for leases,
// keys and deployment packages; queues and tables for its own bookkeeping
// (diagnostic events, some triggers). Its health check exercises all three.
var hostStorageRoles = [
  roles.storageBlobDataOwner
  roles.storageQueueDataContributor
  roles.storageTableDataContributor
]

var deploymentContainer = 'app-package'

// The saints snapshot the publish job writes and /api/season reads
// (functions/src/functions/publish-saints.js). Private: only the Function app
// reads it, with its identity (it already holds Blob Data Owner on this
// account for the host).
var snapshotContainer = 'ordo-snapshot'

// Only Cloudflare may reach the API, so its rate limit and cache can't be
// bypassed through the azurewebsites.net address. Ranges: cloudflare-ips.json.
var cloudflareIps = loadJsonContent('cloudflare-ips.json')
var cloudflareRanges = concat(cloudflareIps.ipv4, cloudflareIps.ipv6)
var cloudflareRules = [
  for (range, i) in cloudflareRanges: {
    name: 'cloudflare-${i + 1}'
    priority: 100 + i
    action: 'Allow'
    ipAddress: range
    description: 'Cloudflare proxy'
  }
]

// ── Observability ────────────────────────────────────────────────────────────

resource log 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-machina'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: json(logDailyCapGb)
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-machina'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: log.id
    IngestionMode: 'LogAnalytics'
    Flow_Type: 'Bluefield'
    Request_Source: 'rest'
    // Only senders that sign in with Entra are accepted, so knowing the
    // connection string isn't enough to send (or flood) telemetry. The
    // Function app signs in with its managed identity; see
    // APPLICATIONINSIGHTS_AUTHENTICATION_STRING.
    DisableLocalAuth: true
  }
}

// The browser's telemetry lives apart: its own component and its own
// workspace. A web page has no identity to sign in with, so this component
// accepts telemetry by connection string, which anyone can read in the page
// source. A flood of fake browser telemetry can fill only this workspace's
// cap. The API's telemetry, and its numbers, stay untouched.
resource logWeb 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-machina-web'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: json(webLogDailyCapGb)
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource appiWeb 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-machina-web'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logWeb.id
    IngestionMode: 'LogAnalytics'
    Flow_Type: 'Bluefield'
    Request_Source: 'rest'
    DisableLocalAuth: false
  }
}

// Starter KQL queries. In the portal: either Log Analytics workspace → Logs →
// Queries → "Machina Christi".
var allowanceQuery = {
  name: 'free-allowance-watch'
  displayName: 'Free allowance watch: GB ingested this month, by table (this workspace)'
  query: 'Usage\n| where TimeGenerated > startofmonth(now()) and IsBillable\n| summarize GB = round(sum(Quantity) / 1000, 3) by DataType\n| order by GB desc'
}

var apiQueries = [
  {
    name: 'api-requests-24h'
    displayName: 'API requests by endpoint, last 24 hours'
    query: 'AppRequests\n| where TimeGenerated > ago(24h)\n| summarize Requests = count(), Failures = countif(Success == false), AvgMs = round(avg(DurationMs), 1), P95Ms = round(percentile(DurationMs, 95), 1) by Name\n| order by Requests desc'
  }
  {
    name: 'api-failures'
    displayName: 'API failures and exceptions, last 7 days'
    query: 'AppRequests\n| where TimeGenerated > ago(7d) and Success == false\n| join kind=leftouter (AppExceptions | project OperationId, ExceptionType, OuterMessage) on OperationId\n| project TimeGenerated, Name, ResultCode, DurationMs, ExceptionType, OuterMessage\n| order by TimeGenerated desc'
  }
  {
    name: 'health-checks'
    displayName: 'Health endpoint: calls per hour and speed'
    query: 'AppRequests\n| where Name == "health"\n| summarize Calls = count(), AvgMs = round(avg(DurationMs), 1), MaxMs = max(DurationMs) by bin(TimeGenerated, 1h)\n| order by TimeGenerated desc'
  }
  {
    // Every call counted here is one Cloudflare could NOT answer from its cache:
    // the fewer per day, the better the edge is doing its job. (The Functions
    // host logs URLs without their query string, so the date asked isn't here.)
    name: 'season-origin-hits'
    displayName: 'Season API: calls that reached Azure, per day'
    query: 'AppRequests\n| where TimeGenerated > ago(30d) and Name == "season"\n| summarize OriginCalls = count(), Refused = countif(ResultCode startswith "4"), Failures = countif(Success == false), AvgMs = round(avg(DurationMs), 1) by Day = bin(TimeGenerated, 1d)\n| order by Day desc'
  }
  {
    // One row per run of the saints publish job (weekly timer, or the deploy
    // after a migration). ConnectMs is how long the database took to answer:
    // about a minute means it was asleep and woke for this run.
    name: 'saints-publish-runs'
    displayName: 'Saints publish runs: result, database wake time, size'
    query: 'AppRequests\n| where TimeGenerated > ago(90d) and Name == "publishSaints"\n| project TimeGenerated, OperationId, Success, TotalMs = round(DurationMs)\n| join kind=leftouter (AppTraces\n    | where Message startswith "published saints snapshot" or Message startswith "connect attempt"\n    | summarize Detail = take_anyif(Message, Message startswith "published"), WakeRetries = countif(Message startswith "connect attempt") by OperationId) on OperationId\n| extend ConnectMs = toint(extract(@"database connect (\\d+) ms", 1, Detail)), Feasts = toint(extract(@"(\\d+) feasts", 1, Detail)), Bytes = toint(extract(@"(\\d+) bytes", 1, Detail))\n| project TimeGenerated, Success, ConnectMs, WakeRetries, TotalMs, Feasts, Bytes\n| order by TimeGenerated desc'
  }
  {
    // The season API answers saints from the published snapshot; when it can't
    // read it, it falls back to the bios bundled with the API and says so here.
    // Empty is good.
    name: 'saints-snapshot-fallbacks'
    displayName: 'Saints snapshot: times the API could not read it (empty is good)'
    query: 'AppTraces\n| where TimeGenerated > ago(30d) and Message startswith "saints snapshot unavailable"\n| summarize Times = count(), Last = max(TimeGenerated) by Message\n| order by Last desc'
  }
  allowanceQuery
]

var siteQueries = [
  {
    name: 'site-page-views'
    displayName: 'Site: page views by page, last 7 days'
    query: 'AppPageViews\n| where TimeGenerated > ago(7d)\n| summarize Views = count() by Page = tostring(parse_url(Url).Path)\n| order by Views desc'
  }
  {
    name: 'site-referrers'
    displayName: 'Site: how visitors arrive (referrer), last 30 days'
    query: 'AppPageViews\n| where TimeGenerated > ago(30d)\n| extend Ref = tostring(Properties.refUri)\n| extend Source = iff(isempty(Ref), "(direct or hidden)", tostring(parse_url(Ref).Host))\n| where Source !in ("machinachristi.com", "www.machinachristi.com")\n| summarize Views = count() by Source\n| order by Views desc'
  }
  {
    name: 'site-countries'
    displayName: 'Site: page views by country, last 30 days'
    query: 'AppPageViews\n| where TimeGenerated > ago(30d)\n| summarize Views = count() by ClientCountryOrRegion\n| order by Views desc'
  }
  {
    name: 'site-time-on-page'
    displayName: 'Site: time on page (visible seconds), last 30 days'
    query: 'AppEvents\n| where TimeGenerated > ago(30d) and Name == "page-time"\n| summarize Seconds = sum(todouble(Measurements.visibleSeconds)) by OperationId, Page = tostring(Properties.page)\n| summarize Visits = count(), MedianSeconds = round(percentile(Seconds, 50), 1), P90Seconds = round(percentile(Seconds, 90), 1) by Page\n| order by Visits desc'
  }
  {
    name: 'site-csp-reports'
    displayName: 'Site: Content Security Policy reports, last 30 days'
    query: 'AppEvents\n| where TimeGenerated > ago(30d) and Name == "csp-violation"\n| summarize Reports = count(), Last = max(TimeGenerated) by Page = tostring(Properties.page), Directive = tostring(Properties.directive), Blocked = tostring(Properties.blocked), Disposition = tostring(Properties.disposition)\n| order by Reports desc'
  }
  {
    name: 'site-script-errors'
    displayName: 'Site: script errors, last 7 days'
    query: 'AppExceptions\n| where TimeGenerated > ago(7d) and ClientType == "Browser"\n| summarize Count = count(), Last = max(TimeGenerated) by Page = OperationName, Message = OuterMessage\n| order by Count desc'
  }
  allowanceQuery
]

resource apiSavedQueries 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = [
  for q in apiQueries: {
    parent: log
    name: q.name
    properties: {
      category: 'Machina Christi'
      displayName: q.displayName
      query: q.query
      version: 2
    }
  }
]

resource siteSavedQueries 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = [
  for q in siteQueries: {
    parent: logWeb
    name: q.name
    properties: {
      category: 'Machina Christi'
      displayName: q.displayName
      query: q.query
      version: 2
    }
  }
]

// ── Storage (Function host state and deployment packages) ───────────────────

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stmachina${suffix}'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  tags: tags
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false // identity only: account keys are switched off
    allowCrossTenantReplication: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource packages 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainer
  properties: {
    publicAccess: 'None'
  }
}

resource snapshots 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: snapshotContainer
  properties: {
    publicAccess: 'None'
  }
}

// ── API: Function app on Flex Consumption ───────────────────────────────────

// The app's identity. User-assigned, so it exists and holds its roles before
// the app first starts (no wait for permissions to catch up).
resource funcIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-machina-func'
  location: location
  tags: tags
}

resource hostStorageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for role in hostStorageRoles: {
    scope: storage
    name: guid(storage.id, funcIdentity.id, role)
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role)
      principalId: funcIdentity.properties.principalId
      principalType: 'ServicePrincipal'
      description: 'Function app: host storage and deployment packages'
    }
  }
]

resource metricsPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: appi
  name: guid(appi.id, funcIdentity.id, roles.monitoringMetricsPublisher)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.monitoringMetricsPublisher)
    principalId: funcIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Function app: send telemetry with Entra auth'
  }
}

// Both copies of the app (see "Moving to Central US" below) share these.
var apiSiteConfig = {
  minTlsVersion: '1.2'
  ftpsState: 'Disabled'
  // Anything not listed is denied. The deployment site (scm) has its own
  // list and stays reachable for CI, which signs in with Entra.
  ipSecurityRestrictions: cloudflareRules
  ipSecurityRestrictionsDefaultAction: 'Deny'
  cors: {
    allowedOrigins: allowedOrigins
  }
}

var apiAppSettings = [
  // Host storage via identity: service addresses instead of a connection
  // string (the account-name shortcut doesn't cover tables).
  {
    name: 'AzureWebJobsStorage__blobServiceUri'
    value: storage.properties.primaryEndpoints.blob
  }
  {
    name: 'AzureWebJobsStorage__queueServiceUri'
    value: storage.properties.primaryEndpoints.queue
  }
  {
    name: 'AzureWebJobsStorage__tableServiceUri'
    value: storage.properties.primaryEndpoints.table
  }
  {
    name: 'AzureWebJobsStorage__credential'
    value: 'managedidentity'
  }
  {
    name: 'AzureWebJobsStorage__clientId'
    value: funcIdentity.properties.clientId
  }
  // The connection string says where to send; the authentication string
  // makes the app prove who it is with Entra.
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: appi.properties.ConnectionString
  }
  {
    name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING'
    value: 'ClientId=${funcIdentity.properties.clientId};Authorization=AAD'
  }
  // The saints publish job: reads the database as this identity (a
  // read-only database user, db/bootstrap.sql) and writes the snapshot
  // that /api/season serves.
  {
    name: 'FUNC_IDENTITY_CLIENT_ID'
    value: funcIdentity.properties.clientId
  }
  {
    name: 'SQL_SERVER'
    value: sql.properties.fullyQualifiedDomainName
  }
  {
    name: 'SQL_DATABASE'
    value: sqlDb.name
  }
  {
    name: 'SAINTS_SNAPSHOT_URL'
    value: '${storage.properties.primaryEndpoints.blob}${snapshotContainer}/saints.json'
  }
]

var apiFunctionAppConfig = {
  deployment: {
    storage: {
      type: 'blobContainer'
      value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer}'
      authentication: {
        type: 'UserAssignedIdentity'
        userAssignedIdentityResourceId: funcIdentity.id
      }
    }
  }
  scaleAndConcurrency: {
    maximumInstanceCount: maxInstances
    instanceMemoryMB: 512
  }
  runtime: {
    name: 'node'
    version: '24'
  }
}

// ── The API's private network (Central US) ──────────────────────────────────
//
// The app sits in a subnet of its own network, and the database admits only
// that subnet (a service endpoint plus a virtual network rule): reaching the
// database's door takes both being inside this network and holding a badge
// with a database user. A service endpoint works only within one region, and
// the database is in Central US, so the app is too.
//
// Free: virtual networks, subnets and service endpoints cost nothing. The app
// still reaches the internet (Application Insights, Entra) through Azure's own
// outbound addresses, so no NAT gateway is needed. Proven on 2026-10-14 with a
// throwaway copy (see infra/README.md, "The API's network").

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-machina'
  location: apiLocation
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.50.0.0/24']
    }
    subnets: [
      {
        // Flex Consumption: at least /27, delegated to Microsoft.App/environments,
        // no underscore in the name.
        name: 'func'
        properties: {
          addressPrefix: '10.50.0.0/27'
          delegations: [
            {
              name: 'flex'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
          serviceEndpoints: [
            {
              service: 'Microsoft.Sql'
              locations: [apiLocation]
            }
          ]
        }
      }
    ]
  }
}

resource funcSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: vnet
  name: 'func'
}

// ── Moving to Central US (AB#73) ────────────────────────────────────────────
//
// A Flex app can't change region, so the API moves blue-green: a new app in
// Central US (funcCus) runs beside the old one in East US 2 (func), both
// answering api.machinachristi.com; deploys go to the new one only. Once
// Cloudflare's CNAME points at the new app and it's proven, the old app and
// the database's "allow Azure services" rule are removed (PR B).

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'asp-machina'
  location: location
  kind: 'functionapp'
  tags: tags
  sku: {
    tier: 'FlexConsumption'
    name: 'FC1'
  }
  properties: {
    reserved: true // Linux
  }
}

// The old app (East US 2): still serving until Cloudflare is switched.
resource func 'Microsoft.Web/sites@2024-04-01' = {
  name: 'func-machina-${suffix}'
  location: location
  kind: 'functionapp,linux'
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${funcIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: union(apiSiteConfig, { appSettings: apiAppSettings })
    functionAppConfig: apiFunctionAppConfig
  }
  dependsOn: [
    hostStorageAccess
    metricsPublisher
  ]
}

// The custom hostname, so Azure answers requests addressed to it. No
// certificate binding: Cloudflare (Full mode) accepts Azure's default one.
resource apiHostBinding 'Microsoft.Web/sites/hostNameBindings@2024-04-01' = {
  parent: func
  name: apiHostname
  properties: {
    hostNameType: 'Verified'
    siteName: func.name
  }
}

// Deploys sign in with Entra; the old username/password publishing is off.
resource scmBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: func
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: func
  name: 'ftp'
  properties: {
    allow: false
  }
}

// The new app (Central US), inside the private network. Same identity, same
// settings, same Cloudflare-only front door; it also says where it runs
// (/api/health reports API_REGION).
resource planCus 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'asp-machina-cus'
  location: apiLocation
  kind: 'functionapp'
  tags: tags
  sku: {
    tier: 'FlexConsumption'
    name: 'FC1'
  }
  properties: {
    reserved: true // Linux
  }
}

resource funcCus 'Microsoft.Web/sites@2024-04-01' = {
  name: 'func-machina-cus-${suffix}'
  location: apiLocation
  kind: 'functionapp,linux'
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${funcIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: planCus.id
    httpsOnly: true
    virtualNetworkSubnetId: funcSubnet.id
    siteConfig: union(apiSiteConfig, {
      appSettings: concat(apiAppSettings, [
        {
          name: 'API_REGION'
          value: apiLocation
        }
      ])
    })
    functionAppConfig: apiFunctionAppConfig
  }
  dependsOn: [
    hostStorageAccess
    metricsPublisher
  ]
}

// The same hostname on the new app. Azure accepts it on a second app because
// the asuid.api TXT record proves the domain belongs to this subscription;
// which app actually receives visitors is decided by Cloudflare's CNAME.
resource apiHostBindingCus 'Microsoft.Web/sites/hostNameBindings@2024-04-01' = {
  parent: funcCus
  name: apiHostname
  properties: {
    hostNameType: 'Verified'
    siteName: funcCus.name
  }
}

resource scmBasicAuthCus 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: funcCus
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpBasicAuthCus 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: funcCus
  name: 'ftp'
  properties: {
    allow: false
  }
}

// ── Database: Azure SQL, free offer ─────────────────────────────────────────
//
// Ordo's saints. The server and database are created by people
// (bootstrap.bicep → modules/sql.bicep), because a server's settings include
// who administers it; this file only refers to them and manages the firewall.
// Visitors never query the database: a job publishes JSON when the data
// changes, and weekly (functions/src/functions/publish-saints.js).

resource sql 'Microsoft.Sql/servers@2023-08-01' existing = {
  name: 'sql-machina-cus-${suffix}'
}

resource sqlDb 'Microsoft.Sql/servers/databases@2023-08-01' existing = {
  parent: sql
  name: 'machina'
}

// The API's subnet may reach the database (service endpoint + this rule).
resource sqlFromApiSubnet 'Microsoft.Sql/servers/virtualNetworkRules@2023-08-01' = {
  parent: sql
  name: 'api-subnet'
  properties: {
    virtualNetworkSubnetId: funcSubnet.id
    ignoreMissingVnetServiceEndpoint: false
  }
}

// Until the old East US 2 app is retired, connections from anywhere inside
// Azure are still allowed through the firewall (that app has no fixed address
// and no network of its own); Entra-only sign-in still turns away anyone
// without a database user. Removed in PR B (AB#73), by a deliberate delete:
// dropping it from this file alone wouldn't remove it from Azure. The deploy
// adds its runner's own address for the length of a migration and removes it.
resource sqlAllowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01' = {
  parent: sql
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Deploys go to the new app (Central US); the old one keeps its last build.
output functionAppName string = funcCus.name
output functionAppHostName string = funcCus.properties.defaultHostName
output apiHostname string = apiHostBindingCus.name
output oldFunctionAppName string = func.name
output oldFunctionAppHostName string = func.properties.defaultHostName
output vnetName string = vnet.name
output appInsightsName string = appi.name
output webAppInsightsName string = appiWeb.name
output webLogWorkspaceName string = logWeb.name
output logWorkspaceName string = log.name
output storageAccountName string = storage.name
output sqlServerName string = sql.name
output sqlServerFqdn string = sql.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDb.name
output funcIdentityName string = funcIdentity.name
output funcIdentityPrincipalId string = funcIdentity.properties.principalId
