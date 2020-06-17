'use strict';
const writer = require('../../utils/writer.js')
const dbUtils = require('./utils')
const Asset = require(`./AssetService`);
const Package = require(`./PackageService`);
// const User = require(`./UserService`);
// const Reviews = require(`./ReviewService`);


/**
 * Return version information
 *
 * returns ApiVersion
 **/
exports.getVersion = async function(userObject) {
  try {
    return (dbUtils.version)
  }
  catch(err) {
    throw ( writer.respondWithCode ( 500, {message: err.message,stack: err.stack} ) )
  }
}

exports.replaceAppData = async function (importOpts, appData, userObject, res ) {
  function dmlObjectFromAppData (appdata) {
    let {packages, assets, users, reviews} = appdata

    let dml = {
      preload: [
      ],
      postload: [
      ],
      package: {
        sqlDelete: `DELETE FROM package`,
        sqlInsert: `INSERT INTO
        package (
          packageId,
          name,
          workflow,
          metadata 
        ) VALUES ?`,
        insertBinds: []
      },
      userData: {
        sqlDelete: `DELETE FROM user_data`,
        sqlInsert: `INSERT INTO
        user_data (
          userId,
          username, 
          display,
          email,
          globalAccess,
          canCreatePackage,
          canAdmin,
          metadata
        ) VALUES ?`,
        insertBinds: []
      },
      packageGrant: {
        sqlDelete: `DELETE FROM package_grant`,
        sqlInsert: `INSERT INTO
        package_grant (
          packageId,
          userId,
          accessLevel
        ) VALUES ?`,
        insertBinds: []
      },
      asset: {
        sqlDelete: `DELETE FROM asset`,
        sqlInsert: `INSERT INTO asset (
          assetId,
          packageId,
          name,
          ip,
          nonnetwork,
          metadata
        ) VALUES ?`,
        insertBinds: []
      },
      stigAssetMap: {
        sqlDelete: `DELETE FROM stig_asset_map`,
        sqlInsert: `INSERT INTO stig_asset_map (
          assetId,
          benchmarkId,
          userIds
        ) VALUES ?`,
        insertBinds: []
      },
      userStigAssetMap: {
        sqlDelete: `DELETE FROM user_stig_asset_map`,
        // sqlInsert: `INSERT INTO stigman.user_stig_asset_map (
        //   userId,
        //   benchmarkId,
        //   assetId
        // ) VALUES ?`,
        sqlInsert: `INSERT INTO user_stig_asset_map
        (saId, userId)
        SELECT
        sa.saId,
        jt.userId
        FROM
        stig_asset_map sa,
          JSON_TABLE(
            sa.userIds,
            "$[*]"
            COLUMNS(
              userId INT(11) PATH "$"
            )
          ) AS jt`,
        insertBinds: [null] // dummy value so length > 0
      },
      reviewHistory: {
        sqlDelete: `DELETE FROM review_history`,
        sqlInsert: `INSERT INTO review_history (
          assetId,
          ruleId,
          activityType,
          columnName,
          oldValue,
          newValue,
          userId,
          ts
        ) VALUES ?`,
        insertBinds: []
      },
      review: {
        sqlDelete: `DELETE FROM review`,
        sqlInsert: `INSERT IGNORE INTO review (
          assetId,
          ruleId,
          resultId,
          resultComment,
          actionId,
          actionComment,
          userId,
          autoResult,
          ts,
          rejectText,
          rejectUserId,
          statusId
        ) VALUES ?`,
        insertBinds: []
      }
    }

    // Process appdata object

    // Table: user_data
    for (const u of users) {
      dml.userData.insertBinds.push([
        parseInt(u.userId) || null,
        u.username, 
        u.display,
        u.email,
        u.globalAccess ? 1 : 0,
        u.canCreatePackage ? 1 : 0,
        u.canAdmin ? 1 : 0,
        JSON.stringify(u.metadata)
      ])
    }
    
    // Tables: package, package_grant_map
    for (const p of packages) {
      dml.package.insertBinds.push([
        parseInt(p.packageId) || null,
        p.name,
        p.workflow,
        JSON.stringify(p.metadata)
      ])
      for (const grant of p.grants) {
        dml.packageGrant.insertBinds.push([
          parseInt(p.packageId) || null,
          parseInt(grant.userId) || null,
          grant.accessLevel
        ])
      }
    }


    // Tables: asset, stig_asset_map, user_stig_asset_map
    for (const asset of assets) {
      let { stigReviewers, ...assetFields} = asset
      dml.asset.insertBinds.push([
        parseInt(assetFields.assetId) || null,
        parseInt(assetFields.packageId) || null,
        assetFields.name,
        assetFields.ip,
        assetFields.nonnetwork ? 1: 0,
        JSON.stringify(assetFields.metadata)
      ])
      let assetId = assetFields.assetId
      for (const sr of stigReviewers) {
        const userIds = []
        if (sr.userIds && sr.userIds.length > 0) {
          for (const userId of sr.userIds) {
            userIds.push(parseInt(userId) || null)
          }
        }
        dml.stigAssetMap.insertBinds.push([
          parseInt(assetId) || null,
          sr.benchmarkId,
          JSON.stringify(userIds)
        ])
      }
    }

    // Tables: review, review_history
    for (const review of reviews) {
      for (const h of review.history) {
        dml.reviewHistory.insertBinds.push([
          review.assetId,
          review.ruleId,
          h.activityType,
          h.columnName,
          h.oldValue,
          h.newValue,
          h.userId,
          new Date(h.ts)
        ])
      }
      dml.review.insertBinds.push([
        parseInt(review.assetId) || null,
        review.ruleId,
        dbUtils.REVIEW_RESULT_API[review.result],
        review.resultComment,
        review.action ? dbUtils.REVIEW_ACTION_API[review.action] : null,
        review.actionComment,
        parseInt(review.userId) || null,
        review.autoState ? 1 : 0,
        new Date(review.ts),
        review.rejectText,
        parseInt(review.rejectUserId) || null,
        review.status ? dbUtils.REVIEW_STATUS_API[review.status] : 0
      ])
    }

    return dml
  }

  let connection
  try {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.write('replaceAppData()\n')
    let result, hrstart, hrend, tableOrder, dml, stats = {}
    let totalstart = process.hrtime() 

    hrstart = process.hrtime() 
    dml = dmlObjectFromAppData(appData)
    hrend = process.hrtime(hrstart)
    stats.dmlObject = `Built in ${hrend[0]}s  ${hrend[1] / 1000000}ms`
    res.write('dmlObjectFromAppData()\n')

    // Connect to MySQL and start transaction
    connection = await dbUtils.pool.getConnection()
    await connection.query('START TRANSACTION')

    // // Preload
    // hrstart = process.hrtime() 
    // for (const sql of dml.preload) {
    //   console.log(sql)
    //   ;[result] = await connection.execute(sql)
    // }
    // hrend = process.hrtime(hrstart)
    // stats.preload = `${result.affectedRows} in ${hrend[0]}s  ${hrend[1] / 1000000}ms`

    // Deletes
    tableOrder = [
      'reviewHistory',
      'review',
      'userStigAssetMap',
      'stigAssetMap',
      'packageGrant',
      'package',
      'asset',
      'userData',
    ]
    for (const table of tableOrder) {
      hrstart = process.hrtime() 
      ;[result] = await connection.query(dml[table].sqlDelete)
      hrend = process.hrtime(hrstart)
      stats[table] = {}
      stats[table].delete = `${result.affectedRows} in ${hrend[0]}s  ${hrend[1] / 1000000}ms`
    }
    res.write('deletes\n')

    // Inserts

  
    tableOrder = [
      'userData',
      'package',
      'packageGrant',
      'asset',
      'stigAssetMap',
      'userStigAssetMap',
      'review',
      'reviewHistory'
    ]
    for (const table of tableOrder) {
      if (dml[table].insertBinds.length > 0) {
        hrstart = process.hrtime()

        let i, j, bindchunk, chunk = 5000;
        for (i=0,j=dml[table].insertBinds.length; i<j; i+=chunk) {
          res.write(`table: ${table} chunk: ${i}\n`)
          bindchunk = dml[table].insertBinds.slice(i,i+chunk);
          ;[result] = await connection.query(dml[table].sqlInsert, [bindchunk])
        }
        hrend = process.hrtime(hrstart)
        stats[table].insert = `${result.affectedRows} in ${hrend[0]}s  ${hrend[1] / 1000000}ms`
      }
    }
    
    // Commit
    hrstart = process.hrtime() 
    res.write(`before commit\n`)
    await connection.query('COMMIT')
    res.write(`after commit\n`)
    hrend = process.hrtime(hrstart)
    stats.commit = `${result.affectedRows} in ${hrend[0]}s  ${hrend[1] / 1000000}ms`

    // // Postload
    // hrstart = process.hrtime() 
    // for (const sql of dml.postload) {
    //   ;[result] = await connection.execute(sql)
    // }
    // hrend = process.hrtime(hrstart)
    // stats.postload = `${result.affectedRows} in ${hrend[0]}s  ${hrend[1] / 1000000}ms`

    // Total time calculation
    hrend = process.hrtime(totalstart)
    stats.total = `TOTAL in ${hrend[0]}s  ${hrend[1] / 1000000}ms`
    res.write(JSON.stringify(stats))
    res.end()

    // return (stats)
  }
  catch (err) {
    if (typeof connection !== 'undefined') {
      await connection.query('ROLLBACK')
    }
    throw err
  }
  finally {
    if (typeof connection !== 'undefined') {
      await connection.release()
    }
  }
}