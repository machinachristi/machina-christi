// The saints publish "mailbox" (AB#81): a storage queue the deploy drops a
// message in after a migration; the API's queue-triggered function
// (publishSaintsOnRequest) then publishes the snapshot under its own identity.
// It replaces calling the app's admin endpoint with its master key, so no
// workflow needs a Function key any more.
//
// Deployed by bootstrap.bicep, by a person: the deploy identity's right to
// post here is a role on CI's own identity, which CI may never grant itself.
// The queue lives in the API's host storage account (main.bicep), whose
// identity already reads and deletes queue messages (hostStorageRoles).
targetScope = 'resourceGroup'

@description('Stable suffix, the same one main.bicep derives from the resource group.')
param suffix string = take(uniqueString(resourceGroup().id), 6)

@description('Principal ID of the identity GitHub Actions deploys as (main branch only).')
param deployPrincipalId string

var queueName = 'saints-publish'
var messageSenderRoleId = 'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a' // Storage Queue Data Message Sender

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: 'stmachina${suffix}'
}

resource queues 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource queue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queues
  name: queueName
}

// Post messages to this one queue, nothing else: not read them, not touch
// any other queue, blob or table.
resource ciPostsToQueue 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: queue
  name: guid(queue.id, deployPrincipalId, messageSenderRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', messageSenderRoleId)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions (main): ask the API to republish the saints snapshot'
  }
}

output queueName string = queue.name
