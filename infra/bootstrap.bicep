// Bootstrap: the few pieces that a person deploys by hand, once, and again
// only when one of them changes. CI never runs this file, and nothing CI can
// sign in as is able to change what's in it.
//
//   az deployment sub create -n machina-bootstrap -l eastus2 \
//     -f infra/bootstrap.bicep -p budgetAlertEmail=<address>
//
// The alert address is passed at deploy time and never committed: this repo is
// public.
targetScope = 'subscription'

@description('Azure region for both resource groups.')
param location string = 'eastus2'

@description('Resource group that holds the platform (what main.bicep deploys).')
param platformResourceGroupName string = 'rg-machina-platform'

@description('Resource group that holds the identities GitHub Actions signs in as.')
param ciResourceGroupName string = 'rg-machina-ci'

@description('Where budget alerts are emailed. Never commit this value.')
param budgetAlertEmail string

@description('Monthly budget in US dollars. The platform is built to stay inside free allowances, so any spend at all is a signal.')
param budgetAmount int = 1

@description('First day of the budget period; must be the first of a month.')
param budgetStartDate string = '2026-10-01'

@description('GitHub repository (owner/name) whose workflows may sign in to Azure.')
param githubRepo string = 'machinachristi/machina-christi'

@description('Region for the SQL server and database. Not the platform\'s region: SQL provisioning is restricted for this subscription in East US 2 (checked 2026-10-13 with the Microsoft.Sql/locations/<region>/capabilities API).')
param sqlLocation string = 'centralus'

@description('Object ID of the Entra group that administers the SQL server: sql-machina-admins, people only, managed by hand.')
param sqlAdminGroupObjectId string = '73f3ec44-adf7-446c-bc42-02a652fc264d'

@description('Display name of that group.')
param sqlAdminGroupName string = 'sql-machina-admins'

@description('Region for the Pray accounts (Cosmos DB, Speech, recordings storage): with the API and SQL.')
param prayLocation string = 'centralus'

var tags = {
  project: 'machina-christi'
  managedBy: 'bicep'
}

resource platformRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: platformResourceGroupName
  location: location
  tags: tags
}

// CI's identities live apart from what CI manages. CI holds no role here, so a
// compromised workflow can't add a new sign-in trust to an identity (a
// backdoor that would outlive the compromise) or delete one.
resource ciRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: ciResourceGroupName
  location: location
  tags: tags
}

// Covers the whole subscription, not just the platform, so a mistake anywhere
// shows up. Budgets alert; they don't stop spending.
resource budget 'Microsoft.Consumption/budgets@2023-05-01' = {
  name: 'budget-machina-monthly'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      actualHalf: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: [budgetAlertEmail]
      }
      actualFull: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [budgetAlertEmail]
      }
      forecastFull: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: [budgetAlertEmail]
      }
    }
  }
}

// What-if is an action, which Reader doesn't include. This role adds just the
// preview actions: they predict and check a deployment, and change nothing.
resource whatIfRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(subscription().id, 'machina-what-if-runner')
  properties: {
    roleName: 'Machina What-If Runner'
    description: 'Preview (what-if) and validate deployments to the Machina Christi platform. Changes nothing.'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          'Microsoft.Resources/deployments/whatIf/action'
          'Microsoft.Resources/deployments/validate/action'
        ]
        notActions: []
      }
    ]
    assignableScopes: [
      platformRg.id
    ]
  }
}

// CI's deploy role: Contributor, less the data stores people own. A SQL
// server's settings include who administers it and Azure can't separate the
// two, so CI may not write (or delete) servers or databases; people do that
// here. CI may still open and close SQL firewall rules for its migrations.
// Likewise the Pray accounts (modules/pray.bicep): CI may not change or delete
// Cosmos DB or Speech accounts, read their keys, or create Cosmos DB's own data
// badges (sqlRoleAssignments are not Azure role assignments, so the ABAC rule
// in ci-access.bicep wouldn't catch them). The first list is Contributor's own
// exclusions, kept identical.
resource deployerRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(subscription().id, 'machina-deployer')
  properties: {
    roleName: 'Machina Deployer'
    description: 'Contributor for the Machina Christi platform, except that it may not create, change or delete SQL servers or databases, or Cosmos DB and Speech accounts, nor read their keys or the Function app\'s keys, or grant Cosmos DB data roles (their admins, access and billing settings stay with people).'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          '*'
        ]
        notActions: [
          'Microsoft.Authorization/*/Delete'
          'Microsoft.Authorization/*/Write'
          'Microsoft.Authorization/elevateAccess/Action'
          'Microsoft.Blueprint/blueprintAssignments/write'
          'Microsoft.Blueprint/blueprintAssignments/delete'
          'Microsoft.Compute/galleries/share/action'
          'Microsoft.Purview/consents/write'
          'Microsoft.Purview/consents/delete'
          'Microsoft.Resources/deploymentStacks/manageDenySetting/action'
          'Microsoft.Subscription/cancel/action'
          'Microsoft.Subscription/enable/action'
          // the SQL server, its admins and sign-in rules, and the database
          // (whose settings include what happens when the free allowance ends)
          'Microsoft.Sql/servers/write'
          'Microsoft.Sql/servers/delete'
          'Microsoft.Sql/servers/administrators/*'
          'Microsoft.Sql/servers/azureADOnlyAuthentications/*'
          'Microsoft.Sql/servers/databases/write'
          'Microsoft.Sql/servers/databases/delete'
          // Cosmos DB: the account (free tier, throughput cap, keys off), its
          // databases and containers, its keys and its own data badges
          'Microsoft.DocumentDB/*/write'
          'Microsoft.DocumentDB/*/delete'
          'Microsoft.DocumentDB/databaseAccounts/listKeys/action'
          'Microsoft.DocumentDB/databaseAccounts/readonlykeys/action'
          'Microsoft.DocumentDB/databaseAccounts/regenerateKey/action'
          'Microsoft.DocumentDB/databaseAccounts/listConnectionStrings/action'
          // Speech: the account (free tier, keys off) and its keys
          'Microsoft.CognitiveServices/*/write'
          'Microsoft.CognitiveServices/*/delete'
          'Microsoft.CognitiveServices/accounts/listKeys/action'
          'Microsoft.CognitiveServices/accounts/regenerateKey/action'
          // Function app keys: nothing in CI needs them (the saints publish is
          // asked for through a queue, AB#81), so CI can't read them at all
          'Microsoft.Web/sites/host/listkeys/action'
          'Microsoft.Web/sites/functions/listkeys/action'
          'Microsoft.Web/sites/functions/listsecrets/action'
        ]
      }
    ]
    assignableScopes: [
      platformRg.id
    ]
  }
}

module sql 'modules/sql.bicep' = {
  scope: platformRg
  name: 'sql'
  params: {
    location: sqlLocation
    adminGroupObjectId: sqlAdminGroupObjectId
    adminGroupName: sqlAdminGroupName
    tags: tags
  }
}

// Pray (Phase 4): the prayers' Cosmos DB, the Speech studio and the private
// recordings storage, with every data role (CI writes, the API reads). Needs
// main.bicep's API identity (id-machina-func) to exist already.
module pray 'modules/pray.bicep' = {
  scope: platformRg
  name: 'pray'
  params: {
    location: prayLocation
    deployPrincipalId: identities.outputs.deployPrincipalId
    tags: tags
  }
}

// The saints publish mailbox (AB#81): the deploy posts a message, the API
// publishes. CI's right to post is granted here, by a person.
module publishQueue 'modules/publish-queue.bicep' = {
  scope: platformRg
  name: 'publish-queue'
  params: {
    deployPrincipalId: identities.outputs.deployPrincipalId
  }
}

module identities 'modules/ci-identities.bicep' = {
  scope: ciRg
  name: 'ci-identities'
  params: {
    location: location
    githubRepo: githubRepo
    tags: tags
  }
}

module access 'modules/ci-access.bicep' = {
  scope: platformRg
  name: 'ci-access'
  params: {
    deployPrincipalId: identities.outputs.deployPrincipalId
    previewPrincipalId: identities.outputs.previewPrincipalId
    whatIfRoleId: whatIfRole.name
    deployRoleId: deployerRole.name
  }
}

// Not secrets: the IDs CI needs to ask Azure for a short-lived token. They go
// in the repo's Actions variables (AZURE_CLIENT_ID, AZURE_PREVIEW_CLIENT_ID,
// AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID).
output deployClientId string = identities.outputs.deployClientId
output previewClientId string = identities.outputs.previewClientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
output sqlServerName string = sql.outputs.serverName
output sqlDatabaseName string = sql.outputs.databaseName
output cosmosAccountName string = pray.outputs.cosmosAccountName
output speechAccountName string = pray.outputs.speechAccountName
output mediaAccountName string = pray.outputs.mediaAccountName
