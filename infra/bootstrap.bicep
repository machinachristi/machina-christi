// Bootstrap: the few subscription-level pieces that a person deploys by hand,
// once, and again only when one of them changes. CI never runs this file. The
// identity it creates for GitHub Actions can manage only what lives inside the
// resource group (see modules/ci-identity.bicep), not the budget or the
// subscription.
//
//   az deployment sub create -n machina-bootstrap -l eastus2 \
//     -f infra/bootstrap.bicep -p budgetAlertEmail=<address>
//
// The alert address is passed at deploy time and never committed: this repo is
// public.
targetScope = 'subscription'

@description('Azure region for the resource group and everything in it.')
param location string = 'eastus2'

@description('Resource group that holds the whole platform.')
param resourceGroupName string = 'rg-machina-platform'

@description('Where budget alerts are emailed. Never commit this value.')
param budgetAlertEmail string

@description('Monthly budget in US dollars. The platform is built to stay inside free allowances, so any spend at all is a signal.')
param budgetAmount int = 1

@description('First day of the budget period; must be the first of a month.')
param budgetStartDate string = '2026-10-01'

@description('GitHub repository (owner/name) whose workflows may sign in to Azure.')
param githubRepo string = 'machinachristi/machina-christi'

var tags = {
  project: 'machina-christi'
  managedBy: 'bicep'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// Covers the whole subscription, not just the resource group, so a mistake
// anywhere shows up. Budgets alert; they don't stop spending.
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

module ci 'modules/ci-identity.bicep' = {
  scope: rg
  name: 'ci-identity'
  params: {
    location: location
    githubRepo: githubRepo
    tags: tags
  }
}

// Not secrets: the IDs CI needs to ask Azure for a short-lived token. They go
// in the repo's Actions variables (AZURE_CLIENT_ID, AZURE_TENANT_ID,
// AZURE_SUBSCRIPTION_ID).
output resourceGroupName string = rg.name
output ciClientId string = ci.outputs.clientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
