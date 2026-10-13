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
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      // Anything not listed is denied. The deployment site (scm) has its own
      // list and stays reachable for CI, which signs in with Entra.
      ipSecurityRestrictions: cloudflareRules
      ipSecurityRestrictionsDefaultAction: 'Deny'
      cors: {
        allowedOrigins: allowedOrigins
      }
      appSettings: [
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
      ]
    }
    functionAppConfig: {
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

output functionAppName string = func.name
output functionAppHostName string = func.properties.defaultHostName
output apiHostname string = apiHostBinding.name
output appInsightsName string = appi.name
output webAppInsightsName string = appiWeb.name
output webLogWorkspaceName string = logWeb.name
output logWorkspaceName string = log.name
output storageAccountName string = storage.name
