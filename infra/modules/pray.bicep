// Pray (Phase 4, AB#41): the prayers' database, the recording studio and the
// cupboard the recordings are kept in, plus who may use each of them.
//
// Deployed by bootstrap.bicep, by a person, not by CI, for the same reason as
// modules/sql.bicep: these accounts' own settings decide who gets in and what
// they cost (the free tier, the throughput cap, keys on or off), and Azure
// can't let CI change the account without also letting it change those. CI's
// role (Machina Deployer) may not write or delete them, list their keys, or
// hand out Cosmos DB's own badges; it only works inside them, with the data
// roles granted here.
//
// No keys anywhere: every account below has key access switched off, so the
// only way in is a managed identity holding one of the roles granted below.
//
//   CI (id-machina-github-deploy)  writes prayers, makes and stores recordings
//   API (id-machina-func)          reads prayers and recordings, nothing else
//   visitors                       reach recordings only through the API
//
// Free: Cosmos DB's lifetime free tier (1000 RU/s, 25 GB), with the account
// capped at 1000 RU/s so nothing billable can even be created; Speech F0
// (500,000 characters a month; it refuses rather than bills); and a few MB of
// blobs.
targetScope = 'resourceGroup'

@description('Region for all three accounts: Central US, with the API and the SQL database.')
param location string

@description('Stable suffix, the same one main.bicep derives from the resource group.')
param suffix string = take(uniqueString(resourceGroup().id), 6)

@description('Principal ID of the identity GitHub Actions deploys as (main branch only).')
param deployPrincipalId string

param tags object

var databaseName = 'machina'
var prayersContainerName = 'prayers'
var audioContainerName = 'pray-audio'

var roleIds = {
  speechUser: 'f2dc8367-1007-4938-bd23-fe263f013447'
  blobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  blobDataReader: '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'
}

// Cosmos DB's own built-in data roles (its "badges"; separate from Azure's).
var cosmosRoles = {
  dataReader: '00000000-0000-0000-0000-000000000001'
  dataContributor: '00000000-0000-0000-0000-000000000002'
}

// The API's identity is created by main.bicep (CI); here it only gets roles.
resource funcIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-machina-func'
}

// ── Cosmos DB: the prayers, one JSON document each ──────────────────────────

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: 'cosmos-machina-${suffix}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    // Free for the life of the account: the first 1000 RU/s and 25 GB. Only
    // one free-tier account per subscription, chosen at creation.
    enableFreeTier: true
    // Azure refuses any database or container that would take the account
    // past 1000 RU/s, so nothing that costs money can be provisioned.
    capacity: {
      totalThroughputLimit: 1000
    }
    // Entra only: account keys don't work, and databases and containers can
    // only be changed through Azure Resource Manager (this file), never with
    // a key from inside.
    disableLocalAuth: true
    disableKeyBasedMetadataWriteAccess: true
    minimalTlsVersion: 'Tls12'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    // Reachable from the internet, but only with an Entra badge (above). Not
    // locked to the API's subnet on purpose: the CI publisher and, in Phase
    // 5, Azure AI Search must read it, and the prayers are public. Revisit in
    // Phase 7, when the prayer wall holds private intentions.
    publicNetworkAccess: 'Enabled'
    // Default backups: two copies, free.
  }
}

// One database whose 1000 RU/s every container shares (up to 25), so new
// containers later (the prayer wall) stay inside the free tier.
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
    options: {
      throughput: 1000
    }
  }
}

// Partition key /id: each prayer is its own logical partition, so reading one
// is a single point read (about 1 RU).
resource prayers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: prayersContainerName
  properties: {
    resource: {
      id: prayersContainerName
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
        version: 2
      }
    }
  }
}

var prayersScope = '${cosmos.id}/dbs/${databaseName}/colls/${prayersContainerName}'

resource ciWritesPrayers 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, deployPrincipalId, cosmosRoles.dataContributor, prayersScope)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosRoles.dataContributor}'
    principalId: deployPrincipalId
    scope: prayersScope
  }
  dependsOn: [prayers]
}

resource apiReadsPrayers 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, funcIdentity.id, cosmosRoles.dataReader, prayersScope)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosRoles.dataReader}'
    principalId: funcIdentity.properties.principalId
    scope: prayersScope
  }
  dependsOn: [prayers]
}

// ── Azure AI Speech: the recording studio ───────────────────────────────────

resource speech 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'speech-machina-${suffix}'
  location: location
  tags: tags
  kind: 'SpeechServices'
  sku: {
    name: 'F0'
  }
  properties: {
    // Entra sign-in needs the account's own address (a custom subdomain).
    // It can never be changed or removed once set.
    customSubDomainName: 'speech-machina-${suffix}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource ciUsesSpeech 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: speech
  name: guid(speech.id, deployPrincipalId, roleIds.speechUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.speechUser)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions (main): record the prayers'
  }
}

// ── Blob Storage: the recordings, private ───────────────────────────────────
//
// Its own account, apart from the API's host storage (where the API needs
// broad rights). Nothing here is public: visitors hear a recording through
// the API (/api/audio), which reads it with its identity.

resource media 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stmachinamedia${suffix}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false // no keys, so no key-signed SAS links either
    allowCrossTenantReplication: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource mediaBlobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: media
  name: 'default'
}

resource audio 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: mediaBlobs
  name: audioContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource ciWritesAudio 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: audio
  name: guid(audio.id, deployPrincipalId, roleIds.blobDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.blobDataContributor)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions (main): store the prayer recordings'
  }
}

resource apiReadsAudio 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: audio
  name: guid(audio.id, funcIdentity.id, roleIds.blobDataReader)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.blobDataReader)
    principalId: funcIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Function app: play the prayer recordings to visitors'
  }
}

output cosmosAccountName string = cosmos.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output speechAccountName string = speech.name
output speechEndpoint string = speech.properties.endpoint
output mediaAccountName string = media.name
output audioContainerUrl string = '${media.properties.primaryEndpoints.blob}${audioContainerName}'
