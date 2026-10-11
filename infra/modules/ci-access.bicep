// What GitHub Actions may do in the platform resource group.
//
//   deploy  - Contributor: create and change resources here.
//           - Role Based Access Control Administrator, with a condition: it may
//             grant (or remove) only the roles in platform-roles.json, and only
//             for service principals (managed identities are service
//             principals). So even a compromised workflow can't make itself,
//             or anyone, Owner.
//   preview - Reader plus the What-If Runner role: it can see and predict
//             changes, and change nothing.
//
// Adding a role assignment to main.bicep means adding its role to
// platform-roles.json and re-running bootstrap. Widening what CI may grant is
// meant to be a deliberate, human step.
targetScope = 'resourceGroup'

param deployPrincipalId string
param previewPrincipalId string
param whatIfRoleId string

var builtInRoles = {
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c'
  rbacAdministrator: 'f58310d9-a9f6-439a-9e8d-f62e7b41a168'
  reader: 'acdd72a7-3385-48ef-bd42-f606fba81ae7'
}

var grantableRoleIds = join(map(items(loadJsonContent('../platform-roles.json')), r => r.value), ', ')

// Azure ABAC condition, checked on every role-assignment write and delete:
// the role must be one of the listed ones and the assignee a service principal.
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
    AND
    @Resource[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}
  )
)
''', 'ROLE_IDS', grantableRoleIds)

var assignments = [
  {
    principalId: deployPrincipalId
    roleId: builtInRoles.contributor
    description: 'GitHub Actions (main): deploy the platform'
    condition: null
  }
  {
    principalId: deployPrincipalId
    roleId: builtInRoles.rbacAdministrator
    description: 'GitHub Actions (main): grant only the platform data roles, only to service principals'
    condition: rbacCondition
  }
  {
    principalId: previewPrincipalId
    roleId: builtInRoles.reader
    description: 'GitHub Actions (pull requests): read the platform'
    condition: null
  }
  {
    principalId: previewPrincipalId
    roleId: whatIfRoleId
    description: 'GitHub Actions (pull requests): preview changes with what-if'
    condition: null
  }
]

resource roleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for a in assignments: {
    name: guid(resourceGroup().id, a.principalId, a.roleId)
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', a.roleId)
      principalId: a.principalId
      principalType: 'ServicePrincipal'
      description: a.description
      conditionVersion: a.condition == null ? null : '2.0'
      condition: a.condition
    }
  }
]
