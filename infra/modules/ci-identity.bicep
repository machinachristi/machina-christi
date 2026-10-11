// The identity GitHub Actions signs in as. Sign-in uses OIDC: GitHub vouches
// for the workflow run and Azure hands back a token that lasts minutes. No
// password or key is stored anywhere.
//
// What it may do:
//   - Contributor on this resource group: create and change resources here.
//   - Role Based Access Control Administrator, with a condition: it may grant
//     only the roles listed in assignableRoles, and only to managed identities.
//     So even a compromised workflow can't make itself, or anyone, Owner.
//
// The pull_request credential lets PR runs preview changes (what-if). It
// carries the same rights as main. That is acceptable because fork PRs can't
// get a token at all, and anyone who can push a branch here can already merge
// to main.
targetScope = 'resourceGroup'

param location string
param githubRepo string
param tags object

// Every role that main.bicep assigns. Adding a role assignment to main.bicep
// means adding its role here and re-running bootstrap. Widening what CI may
// grant is meant to be a deliberate, human step.
var assignableRoles = {
  storageBlobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  storageQueueDataContributor: '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
  storageTableDataContributor: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
  monitoringMetricsPublisher: '3913510d-42f4-4e42-8a64-420c390055eb'
}

var contributorRole = 'b24988ac-6180-42a0-ab88-20f7382dd24c'
var rbacAdminRole = 'f58310d9-a9f6-439a-9e8d-f62e7b41a168'

var roleIdList = join(map(items(assignableRoles), r => r.value), ', ')

// Azure ABAC condition: role-assignment writes must use a listed role and a
// service principal (managed identities are service principals); deletes are
// limited to assignments of listed roles.
var rbacCondition = replace('''
(
  (
    !(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})
  )
  OR
  (
    @Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {ROLE_IDS}
    AND
    @Request[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}
  )
)
AND
(
  (
    !(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})
  )
  OR
  (
    @Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {ROLE_IDS}
  )
)
''', 'ROLE_IDS', roleIdList)

var githubSubjects = {
  main: 'repo:${githubRepo}:ref:refs/heads/main'
  'pull-request': 'repo:${githubRepo}:pull_request'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-machina-github'
  location: location
  tags: tags
}

// One at a time: Entra rejects concurrent federated-credential writes on the
// same identity.
@batchSize(1)
resource federated 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = [
  for s in items(githubSubjects): {
    parent: identity
    name: 'github-${s.key}'
    properties: {
      issuer: 'https://token.actions.githubusercontent.com'
      subject: s.value
      audiences: ['api://AzureADTokenExchange']
    }
  }
]

resource contributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, contributorRole)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRole)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions: deploy the platform in this resource group'
  }
}

resource rbacAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, rbacAdminRole)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', rbacAdminRole)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions: grant only the listed data roles, only to managed identities'
    conditionVersion: '2.0'
    condition: rbacCondition
  }
}

output clientId string = identity.properties.clientId
output principalId string = identity.properties.principalId
