// The API's "mailboxes": storage queues the deploy drops a message in, and
// the API's queue-triggered functions then do the work under their own
// identity. No workflow needs a Function key.
//   saints-publish  (AB#81)   publishSaintsOnRequest: SQL → saints snapshot
//   search-reindex  (Phase 5) reindexSearchOnRequest: snapshot + prayers →
//                             the search index
//
// Deployed by bootstrap.bicep, by a person: the deploy identity's right to
// post here is a role on CI's own identity, which CI may never grant itself.
// The queues live in the API's host storage account (main.bicep), whose
// identity already reads and deletes queue messages (hostStorageRoles).
targetScope = 'resourceGroup'

@description('Stable suffix, the same one main.bicep derives from the resource group.')
param suffix string = take(uniqueString(resourceGroup().id), 6)

@description('Principal ID of the identity GitHub Actions deploys as (main branch only).')
param deployPrincipalId string

// Each queue's name and what posting to it asks for (the role's description).
var queueList = [
  {
    name: 'saints-publish'
    purpose: 'ask the API to republish the saints snapshot'
  }
  {
    name: 'search-reindex'
    purpose: 'ask the API to rebuild the search index'
  }
]
var messageSenderRoleId = 'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a' // Storage Queue Data Message Sender

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: 'stmachina${suffix}'
}

resource queues 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource queue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = [
  for q in queueList: {
    parent: queues
    name: q.name
  }
]

// Post messages to these queues, nothing else: not read them, not touch any
// other queue, blob or table. One assignment per queue (same name scheme as
// before, so the saints one is unchanged).
resource ciPostsToQueue 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for (q, i) in queueList: {
    scope: queue[i]
    name: guid(queue[i].id, deployPrincipalId, messageSenderRoleId)
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', messageSenderRoleId)
      principalId: deployPrincipalId
      principalType: 'ServicePrincipal'
      description: 'GitHub Actions (main): ${q.purpose}'
    }
  }
]

output queueNames array = [for (q, i) in queueList: queue[i].name]
