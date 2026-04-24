/**
 * Ichthyolog — Google Apps Script endpoint
 *
 * Deploy this once per lab/team. Every phone running Ichthyolog POSTs to the
 * resulting Web App URL. Samples are upserted into the "Samples" tab, and
 * shared reference lists (species, sites, tissues, preservations, storage
 * locations, projects) are upserted into their own tabs so every phone can
 * pull the team's merged lists back down on the next sync.
 *
 * SETUP (one-time, ~3 minutes):
 *   1. Create (or open) the Google Sheet you want to collect into.
 *   2. In the sheet: Extensions → Apps Script.
 *   3. Delete the empty Code.gs contents and paste this entire file.
 *   4. File → Save (give it any name, e.g. "Ichthyolog Endpoint").
 *   5. Deploy → New deployment.
 *      - Select type: "Web app"
 *      - Description: "Ichthyolog v1"
 *      - Execute as: Me
 *      - Who has access: Anyone
 *      - Click Deploy, authorize when prompted (grants access to THIS sheet only).
 *   6. Copy the "Web app" URL (ends in /exec).
 *   7. In Ichthyolog → Settings → paste it into "Google Sheet sync URL" → tap Test connection.
 *
 * BEHAVIOR:
 *   - Samples rows are keyed by `sample_id` (e.g. GPO_MBA_042608_F). Re-syncing
 *     the same sample updates that row in place.
 *   - Collision detection: if two phones created the same auto-generated id
 *     offline, the later one is renamed `{id}_{INITIALS}` and the client is
 *     told via the `renames` field in the response.
 *   - New custom project fields become new columns on the Samples tab
 *     automatically.
 *   - Reference lists are merged by natural key:
 *       species, sites, tissues → `code`
 *       preservations, storage_locations → `name`
 *       projects → `name`
 *     The server returns the current merged state of every list so clients
 *     can pull teammates' additions back.
 *   - GET returns a liveness message. GET ?action=samples returns every
 *     synced sample row as JSON (used by the "Browse cloud" view).
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

// Reference list tabs: natural key + column headers (first column is the key).
const REF_LISTS = {
  species:          { sheet: 'Species',          key: 'code', headers: ['code','latin','common','updated_at'] },
  sites:            { sheet: 'Sites',            key: 'code', headers: ['code','name','updated_at'] },
  tissues:          { sheet: 'Tissues',          key: 'code', headers: ['code','name','updated_at'] },
  preservations:    { sheet: 'Preservations',    key: 'name', headers: ['name','updated_at'] },
  storageLocations: { sheet: 'StorageLocations', key: 'name', headers: ['name','updated_at'] },
  projects:         { sheet: 'Projects',         key: 'name', headers: ['name','custom_fields_json','updated_at'] },
};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'samples') return jsonResponse(getSamples_());
  if (action === 'lists')   return jsonResponse({ ok: true, referenceLists: getAllReferenceLists_() });
  return jsonResponse({
    ok: true,
    message: 'Ichthyolog endpoint is live. POST JSON to sync.',
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

    // Reference list sync — optional; only runs if the client sent any.
    const incomingLists = payload.referenceLists || {};
    for (const key of Object.keys(REF_LISTS)) {
      if (Array.isArray(incomingLists[key])) upsertReferenceList_(key, incomingLists[key]);
    }
    const mergedLists = getAllReferenceLists_();

    return jsonResponse({
      ok: true,
      sheetName,
      appended: toAppend.length,
      updated,
      totalRows: rows.length,
      headers: finalHeaders,
      renames,           // { originalId: resolvedId } so the client can update local ids
      referenceLists: mergedLists
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) }, 200);
  }
}

// ---------- Reference list helpers ----------

function upsertReferenceList_(listKey, items) {
  const spec = REF_LISTS[listKey];
  if (!spec) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(spec.sheet);
  if (!sheet) {
    sheet = ss.insertSheet(spec.sheet);
    sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, spec.headers.length).setFontWeight('bold');
  }
  const lastCol = Math.max(sheet.getLastColumn(), spec.headers.length);
  if (sheet.getLastColumn() < spec.headers.length) {
    sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
    sheet.getRange(1, 1, 1, spec.headers.length).setFontWeight('bold');
  }

  // Index existing rows by key.
  const rowIndex = {};
  if (sheet.getLastRow() > 1) {
    const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, spec.headers.length).getValues();
    vals.forEach((row, i) => {
      const k = row[0];
      if (k !== '' && k != null) rowIndex[String(k)] = i + 2;
    });
  }

  const toAppend = [];
  const nowIso = new Date().toISOString();
  items.forEach(item => {
    const keyVal = item[spec.key];
    if (keyVal == null || keyVal === '') return;
    const keyStr = String(keyVal);
    const rowArr = spec.headers.map(h => {
      if (h === 'custom_fields_json') {
        try { return JSON.stringify(item.customFields || []); } catch (_) { return '[]'; }
      }
      if (h === 'updated_at') return item.updatedAt ? new Date(item.updatedAt).toISOString() : nowIso;
      return item[h] != null ? item[h] : '';
    });
    const existingRow = rowIndex[keyStr];
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, spec.headers.length).setValues([rowArr]);
    } else {
      toAppend.push(rowArr);
      rowIndex[keyStr] = -1;
    }
  });
  if (toAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, spec.headers.length).setValues(toAppend);
  }
}

function getAllReferenceLists_() {
  const out = {};
  for (const key of Object.keys(REF_LISTS)) out[key] = readReferenceList_(key);
  return out;
}

function readReferenceList_(listKey) {
  const spec = REF_LISTS[listKey];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(spec.sheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, spec.headers.length).getValues();
  const out = [];
  vals.forEach(row => {
    if (row[0] === '' || row[0] == null) return;
    const obj = {};
    spec.headers.forEach((h, i) => {
      if (h === 'custom_fields_json') {
        try { obj.customFields = row[i] ? JSON.parse(row[i]) : []; } catch (_) { obj.customFields = []; }
      } else if (h === 'updated_at') {
        obj.updatedAt = row[i] ? Date.parse(row[i]) : null;
      } else {
        obj[h] = row[i];
      }
    });
    out.push(obj);
  });
  return out;
}

// ---------- GET ?action=samples: return all synced sample rows as JSON ----------
function getSamples_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Samples');
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, headers: BASE_HEADERS, rows: [] };
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h));
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  const rows = vals
    .filter(r => r.some(c => c !== '' && c != null))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const v = r[i];
        o[h] = (v instanceof Date) ? v.toISOString() : v;
      });
      return o;
    });
  return { ok: true, headers, rows };
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
