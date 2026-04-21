/**
 * Sample Collector — Google Apps Script endpoint
 *
 * Deploy this once per lab/team. Every device in Sample Collector
 * POSTs to the resulting URL and rows are upserted into the sheet.
 *
 * SETUP (one-time, takes ~3 minutes):
 *   1. Create (or open) the Google Sheet you want to collect into.
 *   2. In the sheet: Extensions → Apps Script.
 *   3. Delete the empty Code.gs contents and paste this entire file.
 *   4. File → Save (give it any name, e.g. "Sample Collector Endpoint").
 *   5. Deploy → New deployment.
 *      - Select type: "Web app"
 *      - Description: "Sample Collector v1"
 *      - Execute as: Me
 *      - Who has access: Anyone
 *      - Click Deploy, authorize when prompted (grants access to THIS sheet only).
 *   6. Copy the "Web app" URL (ends in /exec).
 *   7. In Sample Collector → Settings → paste it into "Google Sheet sync URL" → tap Test connection.
 *
 * BEHAVIOR:
 *   - Rows are keyed by `sample_id` (e.g. GPO_MBA_042608_F). Re-syncing
 *     the same sample updates that row in place.
 *   - New custom project fields become new columns automatically.
 *   - GET on the URL returns a liveness message (handy for "Test connection").
 *
 * UPDATING THE SCRIPT LATER:
 *   Edit this file in Apps Script, save, then Deploy → Manage deployments
 *   → pencil icon on the active deployment → New version → Deploy.
 *   (Don't create a fresh deployment or the Web App URL will change.)
 */

const BASE_HEADERS = [
  'sample_id','organism_id','tissue_code','tissue_name','preservation','storage_location',
  'species_code','species_latin','species_common','site_code','site_name',
  'collector_initials','project','collected_at_iso','collected_at_date','collected_at_time',
  'latitude','longitude','gps_accuracy_m','gps_source','photo_filenames','notes','created_at','updated_at'
];

function doGet(e) {
  return jsonResponse({
    ok: true,
    message: 'Sample Collector endpoint is live. POST JSON to sync.',
    spreadsheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
    version: 'v1'
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Empty POST body');
    const payload = JSON.parse(e.postData.contents);
    const rows = payload.rows || [];
    if (!Array.isArray(rows)) throw new Error('rows must be an array');

    const sheetName = payload.sheetName || 'Samples';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, BASE_HEADERS.length).setValues([BASE_HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, BASE_HEADERS.length).setFontWeight('bold');
    }

    // Read existing headers; compute union with base + incoming keys.
    const lastCol = sheet.getLastColumn();
    const existingHeaders = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(h => h !== '')
      : [];
    const headerSet = new Set(BASE_HEADERS);
    existingHeaders.forEach(h => headerSet.add(h));
    rows.forEach(r => Object.keys(r).forEach(k => headerSet.add(k)));
    const finalHeaders = BASE_HEADERS.concat(
      Array.from(headerSet).filter(h => !BASE_HEADERS.includes(h)).sort()
    );

    // Expand header row if we have new columns
    if (finalHeaders.length > existingHeaders.length) {
      sheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
      sheet.getRange(1, 1, 1, finalHeaders.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Index existing rows by sample_id for upsert. Track collector_initials so we can
    // detect collisions between phones that created the same auto-generated id offline.
    const sampleIdCol = finalHeaders.indexOf('sample_id') + 1;
    const collectorCol = finalHeaders.indexOf('collector_initials') + 1;
    const existingIds = {};          // sample_id -> { row, collector }
    if (sheet.getLastRow() > 1) {
      const lastRow = sheet.getLastRow();
      const idVals = sheet.getRange(2, sampleIdCol, lastRow - 1, 1).getValues();
      const colVals = collectorCol > 0
        ? sheet.getRange(2, collectorCol, lastRow - 1, 1).getValues()
        : idVals.map(() => ['']);
      idVals.forEach((row, i) => {
        if (row[0] !== '' && row[0] != null) {
          existingIds[String(row[0])] = { row: i + 2, collector: String(colVals[i][0] || '').trim().toUpperCase() };
        }
      });
    }

    const toAppend = [];
    const renames = {};   // originalId -> resolvedId (reported back to the client)
    let updated = 0;
    rows.forEach(r => {
      const originalId = r.sample_id ? String(r.sample_id) : '';
      const incomingCollector = String(r.collector_initials || '').trim().toUpperCase();
      let resolvedId = originalId;
      const hit = existingIds[resolvedId];

      // Collision: same sample_id already in sheet from a DIFFERENT collector
      // → append collector initials to make it unique. If that's also taken,
      // append a numeric suffix until it's free.
      if (hit && hit.collector && incomingCollector && hit.collector !== incomingCollector) {
        let candidate = `${originalId}_${incomingCollector}`;
        let n = 2;
        while (existingIds[candidate]) candidate = `${originalId}_${incomingCollector}${n++}`;
        resolvedId = candidate;
        renames[originalId] = resolvedId;
        r.sample_id = resolvedId;
      }

      const arr = finalHeaders.map(h => {
        if (h === 'sample_id') return resolvedId;
        return (r[h] != null && r[h] !== undefined) ? r[h] : '';
      });

      const existing = existingIds[resolvedId];
      if (existing) {
        sheet.getRange(existing.row, 1, 1, arr.length).setValues([arr]);
        updated++;
      } else {
        toAppend.push(arr);
        // Register the new row so the next incoming row in this same batch
        // notices the collision too.
        existingIds[resolvedId] = { row: -1, collector: incomingCollector };
      }
    });
    if (toAppend.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, finalHeaders.length).setValues(toAppend);
    }

    return jsonResponse({
      ok: true,
      sheetName,
      appended: toAppend.length,
      updated,
      totalRows: rows.length,
      headers: finalHeaders,
      renames  // { originalId: resolvedId } so the client can update local ids
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) }, 200);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
