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

@description('Browser origins allowed to call the API.')
param allowedOrigins array = [
  'https://machinachristi.com'
  'https://www.machinachristi.com'
]

@description('Log Analytics daily ingestion cap in GB. 0.15/day is about 4.6 GB a month, inside the 5 GB free allowance.')
param logDailyCapGb string = '0.15'

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

// Starter KQL queries. In the portal: Log Analytics workspace → Logs →
// Queries → "Machina Christi".
var starterQueries = [
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
    name: 'free-allowance-watch'
    displayName: 'Free allowance watch: GB ingested this month, by table'
    query: 'Usage\n| where TimeGenerated > startofmonth(now()) and IsBillable\n| summarize GB = round(sum(Quantity) / 1000, 3) by DataType\n| order by GB desc'
  }
]

resource savedQueries 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = [
  for q in starterQueries: {
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
output appInsightsName string = appi.name
output logWorkspaceName string = log.name
output storageAccountName string = storage.name
