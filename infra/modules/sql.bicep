// The SQL server and its database: Ordo's saints (see db/README.md).
//
// Deployed by bootstrap.bicep, by a person, not by CI. The server's settings
// include who administers it, and Azure can't let CI change a server without
// also letting it change that. So CI's role (Machina Deployer) may not write
// SQL servers or databases at all: it may only open and close firewall rules
// for its migrations, and work inside the database as the narrow database
// user that db/bootstrap.sql gives it.
//
// The free offer: 100,000 vCore-seconds of compute, 32 GB of data and 32 GB of
// backups a month. Visitors never query it (a job publishes JSON when the
// data changes, and weekly), so it sleeps nearly all the time. When the allowance runs out it pauses until the
// next month instead of billing.
targetScope = 'resourceGroup'

@description('Region for the server and database. The first free database fixes the region for all free databases in the subscription, and SQL may be restricted in some regions for this subscription (East US 2, East US, North Central US were, on 2026-10-13).')
param location string

@description('Stable suffix, the same one main.bicep derives from the resource group.')
param suffix string = take(uniqueString(resourceGroup().id), 6)

@description('Object ID and name of the Entra group that administers the server (sql-machina-admins: people only).')
param adminGroupObjectId string
param adminGroupName string

param tags object

// "cus" = Central US. (A failed first attempt in East US 2 left the plain
// name reserved there for a while; naming the region also makes it obvious.)
resource sql 'Microsoft.Sql/servers@2023-08-01' = {
  name: 'sql-machina-cus-${suffix}'
  location: location
  tags: tags
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      login: adminGroupName
      sid: adminGroupObjectId
      principalType: 'Group'
      tenantId: tenant().tenantId
    }
  }
}

resource db 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: sql
  name: 'machina'
  location: location
  tags: tags
  sku: {
    name: 'GP_S_Gen5_2'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 2
  }
  properties: {
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause'
    // autoPauseDelay is left at Azure's default (60 minutes): a free-offer
    // database that auto-pauses at the allowance's end may not change it. So
    // every wake costs at least an hour at 0.5 vCore (1,800 of the 100,000
    // vCore-seconds a month), and the publish job runs on change and weekly,
    // not daily.
    minCapacity: json('0.5')
    maxSizeBytes: 34359738368 // 32 GB, the free limit
    zoneRedundant: false
    requestedBackupStorageRedundancy: 'Local'
  }
}

output serverName string = sql.name
output databaseName string = db.name
