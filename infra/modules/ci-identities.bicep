// The two identities GitHub Actions signs in as. Sign-in is OIDC: GitHub
// vouches for the workflow run and Azure hands back a token that lasts
// minutes. No password or key is stored anywhere.
//
//   deploy  - only runs on main (push or manual run) may use it. main is
//             reached only through a PR that passed the required checks.
//   preview - pull request runs. Read-only (see ci-access.bicep): a PR runs
//             its own copy of the workflow, so whatever a PR can sign in as,
//             any pushed branch can, before review.
targetScope = 'resourceGroup'

param location string
param githubRepo string
param tags object

var identities = {
  deploy: {
    name: 'id-machina-github-deploy'
    subject: 'repo:${githubRepo}:ref:refs/heads/main'
  }
  preview: {
    name: 'id-machina-github-preview'
    subject: 'repo:${githubRepo}:pull_request'
  }
}

resource deploy 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identities.deploy.name
  location: location
  tags: tags
}

resource deployFromMain 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploy
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: identities.deploy.subject
    audiences: ['api://AzureADTokenExchange']
  }
}

resource preview 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identities.preview.name
  location: location
  tags: tags
}

resource previewFromPullRequests 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: preview
  name: 'github-pull-request'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: identities.preview.subject
    audiences: ['api://AzureADTokenExchange']
  }
}

output deployClientId string = deploy.properties.clientId
output deployPrincipalId string = deploy.properties.principalId
output previewClientId string = preview.properties.clientId
output previewPrincipalId string = preview.properties.principalId
