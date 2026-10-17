// Search (Phase 5, AB#42): the site's card catalogue, Azure AI Search on the
// free tier, plus who may use it.
//
// Deployed by bootstrap.bicep, by a person, not by CI, for the same reason as
// modules/pray.bicep: the service's own settings decide who gets in and what
// it costs (the tier, keys on or off), and Azure can't let CI change the
// service without also letting it change those. CI's role (Machina Deployer)
// may not touch Microsoft.Search at all; it gets one narrow role here instead.
//
// No keys: key access is switched off, so the only way in is a managed
// identity holding one of the roles below.
//
//   CI (id-machina-github-deploy)  sets up the index's layout (fields,
//                                  word-cutters, ranking, synonyms); can't
//                                  read or write the cards in it
//   API (id-machina-func)          fills the index (its own indexer: Free
//                                  can't hold an identity, so Azure's built-in
//                                  indexers would need keys) and searches it
//   visitors                       search only through the API (/api/search)
//
// Free: 1 per subscription, 50 MB, 3 indexes, shared hardware, no SLA, and
// Azure may delete a free service after a long time unused (the weekly
// reindex keeps it in use). It has no paid options to switch on by accident.
targetScope = 'resourceGroup'

@description('Region: Central US, with the API.')
param location string

@description('Stable suffix, the same one main.bicep derives from the resource group.')
param suffix string = take(uniqueString(resourceGroup().id), 6)

@description('Principal ID of the identity GitHub Actions deploys as (main branch only).')
param deployPrincipalId string

@description('Role definition ID (a GUID) of Machina Search Schema Writer, defined in bootstrap.bicep.')
param schemaWriterRoleId string

param tags object

var roleIds = {
  searchIndexDataContributor: '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
}

// The API's identity is created by main.bicep (CI); here it only gets a role.
resource funcIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-machina-func'
}

resource search 'Microsoft.Search/searchServices@2025-05-01' = {
  name: 'srch-machina-${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'free'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'Default'
    // Keys off: requests carrying an API key are refused; only Entra badges
    // with a role get in. (authOptions must be absent when this is true.)
    disableLocalAuth: true
    // Free has no private endpoints or IP rules; the badge is the lock, and
    // the cards are public site content.
    publicNetworkAccess: 'enabled'
    // The semantic ranker (an AI re-ranker) comes switched on with its free
    // plan, even on Free; its other plan bills. Off: nothing paid to turn on.
    semanticSearch: 'disabled'
  }
}

// Fill and search the index. Data actions only: it can't change the layout,
// read keys or touch the service's settings. Service scope rather than one
// index, because the index is rebuilt under a new name (site-v<N>) whenever
// its layout changes incompatibly, and Bicep can't scope a role to an index.
resource apiFillsAndSearches 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: search
  name: guid(search.id, funcIdentity.id, roleIds.searchIndexDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.searchIndexDataContributor)
    principalId: funcIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Function app: fill the site search index and answer /api/search'
  }
}

// Set up the index's layout from git (functions/src/lib/search-schema.js),
// like database migrations: indexes and synonym maps, nothing else.
resource ciShapesIndex 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: search
  name: guid(search.id, deployPrincipalId, schemaWriterRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', schemaWriterRoleId)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions (main): apply the search index layout from git'
  }
}

output searchServiceName string = search.name
output searchEndpoint string = 'https://${search.name}.search.windows.net'
