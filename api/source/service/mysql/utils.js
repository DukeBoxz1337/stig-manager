const mysql = require('mysql2/promise');
const config = require('../../utils/config')
const logger = require('../../utils/logger')
const retry = require('async-retry')
const Umzug = require('umzug')
const path = require('path')
const fs = require("fs")
const semverLt = require('semver/functions/lt')

const minMySqlVersion = '8.0.14'
let _this = this

let initAttempt = 0
module.exports.testConnection = async function () {
  logger.writeDebug('mysql', 'preflight', { attempt: ++initAttempt })
  let [result] = await _this.pool.query('SELECT VERSION() as version')
  return result[0].version
}

function getPoolConfig() {
  const poolConfig = {
    connectionLimit : config.database.maxConnections,
    timezone: 'Z',
    host: config.database.host,
    port: config.database.port,
    user: config.database.username,
    database: config.database.schema,
    decimalNumbers: true,
    typeCast: function (field, next) {
      if ((field.type === "BIT") && (field.length === 1)) {
        let bytes = field.buffer() || [0];
        return( bytes[ 0 ] === 1 );
      }
      return next();
    } 
  }
  if (config.database.password) {
    poolConfig.password = config.database.password
  }
  if (config.database.tls.ca_file || config.database.tls.cert_file || config.database.tls.key_file) {
    const sslConfig = {}
    if (config.database.tls.ca_file) {
      sslConfig.ca = fs.readFileSync(path.join(__dirname, '..', '..', 'tls', config.database.tls.ca_file))
    }
    if (config.database.tls.cert_file) {
      sslConfig.cert = fs.readFileSync(path.join(__dirname, '..', '..', 'tls', config.database.tls.cert_file))
    }
    if (config.database.tls.key_file) {
      sslConfig.key = fs.readFileSync(path.join(__dirname, '..', '..', 'tls', config.database.tls.key_file))
    }
    poolConfig.ssl = sslConfig
  }
  return poolConfig
}

module.exports.initializeDatabase = async function () {
  // Create the connection pool
  const poolConfig = getPoolConfig()
  logger.writeDebug('mysql', 'poolConfig', { ...poolConfig })
  _this.pool = mysql.createPool(poolConfig)
  // Set common session variables
  _this.pool.on('connection', function (connection) {
    connection.query('SET SESSION group_concat_max_len=10000000')
  })

  // Call the pool destruction methods on SIGTERM and SEGINT
  async function closePoolAndExit(signal) {
    logger.writeInfo('app', 'shutdown', { signal })
    try {
      await _this.pool.end()
      logger.writeInfo('mysql', 'close', { success: true })
      process.exit(0);
    } catch(err) {
      logger.writeError('mysql', 'close', { success: false, message: err.message })
      process.exit(1);
    }
  }   
  process.on('SIGPIPE', closePoolAndExit)
  process.on('SIGHUP', closePoolAndExit)
  process.on('SIGTERM', closePoolAndExit)
  process.on('SIGINT', closePoolAndExit)

  // Preflight the pool every 5 seconds
  const detectedMySqlVersion = await retry(_this.testConnection, {
    retries: 24,
    factor: 1,
    minTimeout: 5 * 1000,
    maxTimeout: 5 * 1000,
    onRetry: (error) => {
      logger.writeError('mysql', 'preflight', { success: false, message: error.message })
    }
  })
  if ( semverLt(detectedMySqlVersion, minMySqlVersion) ) {
    logger.writeError('mysql', 'preflight', { success: false, message: `MySQL release ${detectedMySqlVersion} is too old. Update to release ${minMySqlVersion} or later.` })
    process.exit(1)
  } 
  else {
    logger.writeInfo('mysql', 'preflight', { 
      success: true,
      version: detectedMySqlVersion
      })

  }

  // Perform migrations
  const umzug = new Umzug({
    migrations: {
      path: path.join(__dirname, './migrations'),
      params: [_this.pool]
    },
    storage: path.join(__dirname, './migrations/lib/umzug-mysql-storage'),
    storageOptions: {
      pool: _this.pool
    }
  })

  if (config.database.revert) {
    const migrations = await umzug.executed()
    if (migrations.length) {
      logger.writeInfo('mysql', 'migration', { message: 'MySQL schema will revert the last migration and terminate' })
      await umzug.down()
    } else {
      logger.writeInfo('mysql', 'migration', { message: 'MySQL schema has no migrations to revert' })
    }
    logger.writeInfo('mysql', 'migration', { message: 'MySQL revert migration has completed' })
    process.exit(1)
  }
  const migrations = await umzug.pending()
  if (migrations.length > 0) {
    logger.writeInfo('mysql', 'migration', { message: `MySQL schema requires ${migrations.length} update${migrations.length > 1 ? 's' : ''}` })
    await umzug.up()
    logger.writeInfo('mysql', 'migration', { message: `All migrations performed successfully` })
  }
  else {
    logger.writeInfo('mysql', 'migration', { message: `MySQL schema is up to date` })
  }
  // return true if the database migrations include the initial scaffolding
  return migrations.length > 0 && migrations[0].file === '0000.js'

}

module.exports.parseRevisionStr = function (revisionStr) {
  let ro = {}
  if (revisionStr !== 'latest') {
    let results = /V(\d+)R(\d+(\.\d+)?)/.exec(revisionStr)
    ro.version = results[1]
    ro.release = results[2]
    ro.table = 'revision'
    ro.table_alias = 'r'
    ro.predicates = ' and r.version = ? and r.release = ? '
  }
  else {
    ro.version = null
    ro.release = null
    ro.table = 'current_rev'
    ro.table_alias = 'cr'
    ro.predicates = ''
  }
  return ro
}

// Returns Boolean
module.exports.userHasAssetStigs = async function (assetId, requestedBenchmarkIds, elevate, userObject) {
  let sql
  let rows
  if (userObject.privileges.globalAccess) {
    sql = `select
      distinct sa.benchmarkId
    from
      stig_asset_map sa
    where
      sa.assetId = ?`

    ;[rows] = await _this.pool.query(sql, [assetId])
  } 
  else {
    sql = `select
      distinct sa.benchmarkId
    from
      stig_asset_map sa
      left join asset a on sa.assetId = a.assetId
      left join collection_grant cg on a.collectionId = cg.collectionId
      left join user_stig_asset_map usa on sa.saId = usa.saId
    where
      cg.userId = ?
      and sa.assetId = ?
      and (cg.accessLevel >= 2 or (cg.accessLevel = 1 and usa.userId = cg.userId))`
    ;[rows] = await _this.pool.query(sql, [userObject.userId, assetId])
  }
  const availableBenchmarkIds = rows.map( row => row.benchmarkId )
  return requestedBenchmarkIds.every( requestedBenchmarkId => availableBenchmarkIds.includes(requestedBenchmarkId))   
}

// @param reviews Array List of Review objects
// @param elevate Boolean 
// @param userObject Object
module.exports.scrubReviewsByUser = async function(reviews, elevate, userObject) {
  const permitted = [], rejected = []
  if (userObject.privileges.globalAccess || elevate) {
    permitted = reviews
  }
  else {
    const sql = `SELECT
      CONCAT(sa.assetId, '-', rgr.ruleId) as permitted
    FROM
      collection_grant cg
      inner join asset a on cg.collectionId = a.collectionId
      inner join stig_asset_map sa on a.assetId = sa.assetId
      inner join revision rev on sa.benchmarkId = rev.benchmarkId
      inner join rev_group_map rg on rev.revId = rg.revId
      inner join rev_group_rule_map rgr on rg.rgId = rgr.rgId
    WHERE
      cg.userId = ?
      and cg.accessLevel != 1
    GROUP BY
      sa.assetId, rgr.ruleId
    UNION
    SELECT
      CONCAT(sa.assetId, '-', rgr.ruleId) as permitted
    FROM
      collection_grant cg
      inner join asset a on cg.collectionId = a.collectionId
      inner join stig_asset_map sa on a.assetId = sa.assetId
      inner join user_stig_asset_map usa on (sa.saId = usa.saId and cg.userId = usa.userId)
      inner join revision rev on sa.benchmarkId = rev.benchmarkId
      inner join rev_group_map rg on rev.revId = rg.revId
      inner join rev_group_rule_map rgr on rg.rgId = rgr.rgId
    WHERE
      cg.userId = ?
      and cg.accessLevel = 1
    GROUP BY
      sa.assetId, rgr.ruleId`
    let [rows] = await _this.pool.query(sql, [userObject.userId, userObject.userId])
    let allowedAssetRules = rows.map(r => r.permitted)
    reviews.forEach(review => {
      if (allowedAssetRules.includes(`${review.assetId}-${review.ruleId}`)) {
        permitted.push(review)
      }
      else {
        rejected.push(review)
      }
    })
  }
  return {
    permitted: permitted,
    rejected: rejected
  }
}

/**
 * updateStatsAssetStig
 * @param {PoolConnection} connection 
 * @param {Object} param1 
 * @param {string} param1.collectionId
 * @param {string} param1.assetId
 * @param {string} param1.benchmarkId
 * @param {string[]} param1.rules
 */
module.exports.updateStatsAssetStig = async function(connection, { collectionId, assetId, benchmarkId, rules }) {
  if (!connection) { throw ('Connection required')}
  // Handle optional predicates, 
  let predicates = ['sa.assetId IS NOT NULL AND sa.benchmarkId IS NOT NULL']
  let binds = []
  let whereClause = ''

  if (rules && rules.length > 0) {
    predicates.push(`sa.benchmarkId IN (SELECT DISTINCT benchmarkId from current_group_rule where ruleId IN ?)`)
    binds.push( [rules] )
  }

  if (collectionId) {
    predicates.push('a.collectionId = ?')
    binds.push(collectionId)
  }
  if (assetId) {
    predicates.push('a.assetId = ?')
    binds.push(assetId)
  }
  if (benchmarkId) {
    predicates.push('sa.benchmarkId = ?')
    binds.push(benchmarkId)
  }
  if (predicates.length > 0) {
    whereClause = `where  ${predicates.join(' and ')}`
  }

  const sqlSelect = `
    select
      sa.assetId,
      sa.benchmarkId,
      min(review.ts) as minTs,
      max(review.ts) as maxTs,
      sum(CASE WHEN review.autoResult = 0 and review.statusId = 0 THEN 1 ELSE 0 END) as savedManual,
      sum(CASE WHEN review.autoResult = 1 and review.statusId = 0 THEN 1 ELSE 0 END) as savedAuto,
      sum(CASE WHEN review.autoResult = 0 and review.statusId = 1 THEN 1 ELSE 0 END) as submittedManual,
      sum(CASE WHEN review.autoResult = 1 and review.statusId = 1 THEN 1 ELSE 0 END) as submittedAuto,
      sum(CASE WHEN review.autoResult = 0 and review.statusId = 2 THEN 1 ELSE 0 END) as rejectedManual,
      sum(CASE WHEN review.autoResult = 1 and review.statusId = 2 THEN 1 ELSE 0 END) as rejectedAuto,
      sum(CASE WHEN review.autoResult = 0 and review.statusId = 3 THEN 1 ELSE 0 END) as acceptedManual,
      sum(CASE WHEN review.autoResult = 1  and review.statusId = 3 THEN 1 ELSE 0 END) as acceptedAuto,
      sum(CASE WHEN review.resultId=4 and r.severity='high' THEN 1 ELSE 0 END) as highCount,
      sum(CASE WHEN review.resultId=4 and r.severity='medium' THEN 1 ELSE 0 END) as mediumCount,
      sum(CASE WHEN review.resultId=4 and r.severity='low' THEN 1 ELSE 0 END) as lowCount
    from
      asset a
      left join stig_asset_map sa using (assetId)
      left join current_group_rule cgr using (benchmarkId)
      left join rule r using (ruleId)
      left join review on (r.ruleId=review.ruleId and review.assetId=sa.assetId)
    ${whereClause}
    group by
      sa.assetId,
      sa.benchmarkId
    FOR UPDATE
    `

  const sqlUpsert = `
  insert into stig_asset_map (
    assetId,
    benchmarkId,
    minTs,
    maxTs,
    savedManual,
    savedAuto,
    submittedManual,
    submittedAuto,
    rejectedManual,
    rejectedAuto,
    acceptedManual,
    acceptedAuto,
    highCount,
    mediumCount,
    lowCount)
  VALUES ? 
    on duplicate key update
      minTs = VALUES(minTs),
      maxTs = VALUES(maxTs),
      savedManual = VALUES(savedManual),
      savedAuto = VALUES(savedAuto),
      submittedManual = VALUES(submittedManual),
      submittedAuto = VALUES(submittedAuto),
      rejectedManual = VALUES(rejectedManual),
      rejectedAuto = VALUES(rejectedAuto),
      acceptedManual = VALUES(acceptedManual),
      acceptedAuto = VALUES(acceptedAuto),
      highCount = VALUES(highCount),
      mediumCount = VALUES(mediumCount),
      lowCount = VALUES(lowCount)
  `

  let results;
  [results] = await connection.query(sqlSelect, binds)

  if (results.length > 0) {
    let bindsUpsert = results.map( r => Object.values(r))
    let stats;
    [stats] = await connection.query(sqlUpsert, [bindsUpsert])
    return stats
  }
  else {
    return false
  }
}

module.exports.uuidToSqlString  = function (uuid) {
  return {
    toSqlString: function () {
      return `UUID_TO_BIN(${mysql.escape(uuid)},1)`
    }
  }
}

module.exports.makeQueryString = function ({columns, joins, predicates, groupBy, orderBy}) {
  return `SELECT
  ${columns.join(',\n  ')}
FROM
  ${joins.join('\n  ')}
${predicates?.statements.length ? 'WHERE\n  ' + predicates.statements.join(' and\n  ') : ''}
${groupBy?.length ? 'GROUP BY\n  ' + groupBy.join(',\n  ') : ''}
${orderBy?.length ? 'ORDER BY\n  ' + orderBy.join(',\n  ') : ''}
`
}

module.exports.CONTEXT_ALL = 'all'
module.exports.CONTEXT_DEPT = 'department'
module.exports.CONTEXT_USER = 'user'
module.exports.REVIEW_RESULT_API = { 
  'notchecked': 1,
  'notapplicable': 2,
  'pass': 3,
  'fail': 4,
  'unknown': 5,
  'error': 6,
  'notselected': 7,
  'informational': 8,
  'fixed': 9
}
module.exports.REVIEW_ACTION_API = { 
  'remediate': 1,
  'mitigate': 2,
  'exception': 3
}
module.exports.REVIEW_STATUS_API = { 
  'saved': 0,
  'submitted': 1,
  'rejected': 2,
  'accepted': 3
}
module.exports.WRITE_ACTION = { 
  CREATE: 0,
  REPLACE: 1,
  UPDATE: 2
}
