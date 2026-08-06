// ============================================================
// EDM DataPorter XML — parser + serializer (round-trip)
//
// Strategy: parse the Cadis serialized XML into a live DOM, build a
// lightweight view-model that references the real DOM elements, and
// write edits straight back into those elements. Export re-serializes
// the SAME DOM, so every untouched element is preserved byte-for-byte.
// ============================================================

// ---- DOM helpers ----
function _xmlParse(str) {
  const doc = new DOMParser().parseFromString(str, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('XML parse error: ' + err.textContent.slice(0, 200));
  return doc;
}
// direct child by tag (avoids descendant matches)
function _child(el, tag) {
  if (!el) return null;
  for (const c of el.children) if (c.tagName === tag) return c;
  return null;
}
function _childText(el, tag) {
  const c = _child(el, tag);
  return c ? c.textContent : '';
}
function _setChildText(el, tag, value) {
  let c = _child(el, tag);
  if (!c) { c = el.ownerDocument.createElement(tag); el.appendChild(c); }
  // drop the Tr="string" empty marker if present, since we now have content
  if (c.getAttribute('Tr') === 'string' && value) c.removeAttribute('Tr');
  c.textContent = value;
  return c;
}
// list items: el > list > Item[]
function _listItems(parentEl, listOwnerTag) {
  const owner = listOwnerTag ? _child(parentEl, listOwnerTag) : parentEl;
  if (!owner) return [];
  const list = _child(owner, 'list');
  if (!list) return [];
  return [...list.children].filter(c => c.tagName === 'Item');
}

// ---- ProcType → display + chip styling ----
const PROCTYPE_META = {
  File_Function:      { label: 'File Function',     chip: 'proc-c-blue',   ic: 'IcArchive' },
  Port_Data:          { label: 'Port Data',         chip: 'proc-c-orange', ic: 'IcFile' },
  Plug_In:            { label: 'Plug-In',           chip: 'proc-c-purple', ic: 'IcLightning' },
  Variable_Assignment:{ label: 'Variables',         chip: 'proc-c-pink',   ic: 'IcVariables' },
  File_Source:        { label: 'File Source',       chip: 'proc-c-orange', ic: 'IcFile' },
  File_Target:        { label: 'File Target',       chip: 'proc-c-teal',   ic: 'IcFile' },
  Action:             { label: 'Action',            chip: 'proc-c-purple', ic: 'IcLightning' },
  Email:              { label: 'Email',             chip: 'proc-c-pink',   ic: 'IcSend' },
  Custom:             { label: 'Custom',            chip: 'proc-c-blue',   ic: 'IcCog' },
  Monitor:            { label: 'Monitor',           chip: 'proc-c-blue',   ic: 'IcConnect' },
  File_Transfer:      { label: 'File Transfer',     chip: 'proc-c-orange', ic: 'IcDownload' },
  Delete_Data:        { label: 'Delete Data',       chip: 'proc-c-red',    ic: 'IcTrash' },
  DB_Process:         { label: 'DB Process',        chip: 'proc-c-teal',   ic: 'IcManager' },
  E_Mail:             { label: 'Email',             chip: 'proc-c-pink',   ic: 'IcSend' },
  Web_Service:        { label: 'Web Service',       chip: 'proc-c-purple', ic: 'IcConnect' },
  Decrypt:            { label: 'Decrypt',           chip: 'proc-c-purple', ic: 'IcShield' },
  External_Process:   { label: 'External Process',  chip: 'proc-c-purple', ic: 'IcLightning' },
  Bulk_Load:          { label: 'Bulk Load',         chip: 'proc-c-teal',   ic: 'IcImport' },
  XSLT_Transform:     { label: 'XSLT Transform',    chip: 'proc-c-blue',   ic: 'IcDiff' },
  FTP:                { label: 'FTP',               chip: 'proc-c-orange', ic: 'IcConnect' },
};

// ============================================================
// Best-practice review — checks parsed model against the EDM
// "Data Porter Best Practice" help-center guidance.
// ============================================================
const SYS_COL_DEFAULTS = {
  CADIS_SYSTEM_UPDATED:   '{RUNTIME VARIABLE}.[Current Date]',
  CADIS_SYSTEM_CHANGEDBY: '{RUNTIME VARIABLE}.[Current User]',
  CADIS_SYSTEM_INSERTED:  '',   // best practice: leave blank
  CADIS_SYSTEM_LASTMODIFIED: '',
};
function porterBestPractice(model) {
  const checks = [];
  // 1 — input count ≤ 10
  const n = model.steps.length;
  checks.push({
    level: n <= 10 ? 'ok' : 'warn',
    title: 'Input count',
    detail: n <= 10
      ? `${n} input step${n === 1 ? '' : 's'} — within the recommended limit of 10.`
      : `${n} input steps — best practice is ≤ 10 per Data Porter. Consider splitting into multiple Porters.`,
  });
  // 2 — BestPracticeActivated flag
  checks.push({
    level: model.bestPractice ? 'ok' : 'info',
    title: 'Best-practice mode',
    detail: model.bestPractice
      ? 'BestPracticeActivated is enabled for this component.'
      : 'BestPracticeActivated is off — enable it for guided validation in EDM.',
  });
  // 3 — system-column default mappings
  const sysMismatch = [];
  const unmapped = [];
  let oaTargets = 0;
  model.steps.forEach(s => s.targets.forEach(t => {
    const isOA = /Overwrite|Append/i.test(t.updateType || '');
    if (isOA) oaTargets++;
    t.mappings.forEach(m => {
      const col = m.name.replace(/^\{TABLE\}\./, '').replace(/[\[\]]/g, '').toUpperCase();
      const val = (m.value || '').trim();
      if (Object.prototype.hasOwnProperty.call(SYS_COL_DEFAULTS, col)) {
        const want = SYS_COL_DEFAULTS[col];
        if (want && val !== want) sysMismatch.push(`${s.name}: ${col} should be "${want}"`);
      } else if (isOA && !val) {
        unmapped.push(`${s.name}: ${col}`);
      }
    });
  }));
  checks.push({
    level: sysMismatch.length ? 'warn' : 'ok',
    title: 'System-column conventions',
    detail: sysMismatch.length
      ? `${sysMismatch.length} system column(s) differ from the recommended default: ` + sysMismatch.slice(0, 3).join('; ') + (sysMismatch.length > 3 ? '…' : '')
      : 'CADIS_SYSTEM_* columns follow the recommended default mappings.',
  });
  // 4 — explicit NULL on overwrite/append
  checks.push({
    level: unmapped.length ? 'warn' : 'ok',
    title: 'Explicit column mapping',
    detail: unmapped.length
      ? `${unmapped.length} column(s) on overwrite/append targets are unmapped. Map an explicit NULL to avoid ambiguity: ` + unmapped.slice(0, 3).join(', ') + (unmapped.length > 3 ? '…' : '')
      : oaTargets ? 'All overwrite/append target columns are explicitly mapped.' : 'No overwrite/append targets in this Porter.',
  });
  // 5 — delete_data note
  const hasDelete = model.steps.some(s => /Delete_Data/i.test(s.procType));
  if (hasDelete) checks.push({ level: 'ok', title: 'Target clearing', detail: 'Uses a Delete_Data step — the recommended way to clear a target table.' });

  const warns = checks.filter(c => c.level === 'warn').length;
  return { checks, warns };
}
function procMeta(pt) {
  return PROCTYPE_META[pt] || { label: pt || 'Step', chip: 'proc-c-blue', ic: 'IcFile' };
}

// ---- Determine a step's "kind" of source for the property panel ----
function stepSourceKind(stepEl) {
  const sf = _child(stepEl, 'SourceFile');
  if (sf && sf.children.length) return 'file';
  const sds = _child(stepEl, 'SourceDataSource');
  if (sds && _child(sds, 'Select')) return 'sql';
  if (sds && sds.children.length) return 'datasource';
  const plug = _child(stepEl, 'Plugin');
  if (plug && plug.children.length) return 'plugin';
  const email = _child(stepEl, 'Email');
  if (email && email.children.length) return 'email';
  return 'none';
}

// ---- Build the view-model from a parsed DataPorter doc ----
function buildPorterModel(doc) {
  const dp = doc.querySelector('DataPorter');
  if (!dp) throw new Error('Not a DataPorter component');
  const inputsItems = _listItems(_child(dp, 'Inputs'), null) ;
  // Inputs > list > Item — _child(dp,'Inputs') then its list
  const inputs = _listItems(dp, 'Inputs');

  const steps = inputs.map((stepEl, i) => {
    // variables (Globals.nv list)
    const globals = _child(stepEl, 'Globals');
    const nvItems = globals ? _listItems(globals, 'nv') : [];
    const variables = nvItems.map(it => ({
      el: it, name: _childText(it, 'Name'), value: _childText(it, 'Value'),
    }));
    // rule-builder variables
    const rbItems = globals ? _listItems(globals, 'RuleBuilderVariables') : [];
    const ruleVars = rbItems.map(it => ({
      el: it, name: _childText(it, 'Name'), rule: _childText(it, 'RuleBuilderName'),
    }));

    // source detail
    const kind = stepSourceKind(stepEl);
    let source = { kind };
    if (kind === 'file') {
      const sf = _child(stepEl, 'SourceFile');
      const folder = _child(sf, 'Folder');
      source.fileName = _childText(sf, 'FileName');
      source.path = folder ? _childText(folder, 'Path') : '';
      source.unc = folder ? _childText(folder, 'UNCPath') : '';
      source.encoding = _childText(sf, 'Encoding');
      source.dateFmt = _childText(sf, 'DateFmt');
      source.srcEl = sf;
    } else if (kind === 'sql') {
      const sds = _child(stepEl, 'SourceDataSource');
      const sel = _child(sds, 'Select');
      source.sqlEl = _child(sel, 'Text');
      source.sql = source.sqlEl ? source.sqlEl.textContent : '';
    } else if (kind === 'plugin') {
      const plug = _child(stepEl, 'Plugin');
      source.assembly = _childText(plug, 'AssemblyFileName');
      source.typeName = _childText(plug, 'TypeName');
      const params = _listItems(plug, 'InputParameterMappings')
        .map(it => ({ el: it, name: _childText(it, 'Name'), value: _childText(it, 'Value'), tag: _childText(it, 'Tag') }))
        .filter(p => p.value && p.value.trim());  // only show set params
      source.params = params;
    }

    // targets
    const targets = _listItems(stepEl, 'Targets').map(tEl => {
      const tds = _child(tEl, 'TargetDataSource');
      const table = tds ? _child(tds, 'Table') : null;
      const tf = _child(tEl, 'TargetFile');
      const colMap = _child(tEl, 'ColMapping');
      const mapItems = colMap ? _listItems(colMap, 'Mappings') : [];
      const mappings = mapItems.map(it => ({
        el: it,
        name: _childText(it, 'Name'),
        value: _childText(it, 'Value'),
        valueEl: _child(it, 'Value'),
      }));
      const uc = _child(tEl, 'UpdateControl');
      const keys = uc ? _listItems(uc, 'Keys') : [];
      return {
        el: tEl,
        targetType: _childText(tEl, 'TargetType'),
        table: table ? `${_childText(table,'Owner')}.${_childText(table,'Name')}` : (tf && tf.children.length ? _childText(tf,'FileName') : ''),
        isFile: !!(tf && tf.children.length),
        fileName: tf ? _childText(tf, 'FileName') : '',
        updateType: uc ? _childText(uc, 'Type') : '',
        dedup: uc ? _childText(uc, 'Dedup') : '',
        keys: keys.map(k => _childText(k, 'key')),
        mappings,
      };
    });

    return {
      el: stepEl,
      idx: i,
      name: _childText(stepEl, 'Name'),
      procType: _childText(stepEl, 'ProcType'),
      enabled: _childText(stepEl, 'Enabled') === 'True',
      precedence: _childText(stepEl, 'Precedence'),
      description: _childText(stepEl, 'Description'),
      sourceType: _childText(stepEl, 'SourceType'),
      kind,
      source,
      targets,
      variables,
      ruleVars,
    };
  });

  return {
    doc,
    dpEl: dp,
    name: _childText(dp, 'Name'),
    comment: _childText(dp, 'Comment'),
    bestPractice: _childText(dp, 'BestPracticeActivated') === 'True',
    version: doc.querySelector('VersionNumber')?.textContent || '',
    steps,
  };
}

// ---- Mutators (write back into the DOM) ----
function setStepEnabled(step, on) { _setChildText(step.el, 'Enabled', on ? 'True' : 'False'); }
function setStepPrecedence(step, val) { _setChildText(step.el, 'Precedence', val); }
function setStepDescription(step, val) { _setChildText(step.el, 'Description', val); }
function setMappingValue(mapping, val) {
  let c = mapping.valueEl;
  if (!c) { c = mapping.el.ownerDocument.createElement('Value'); mapping.el.appendChild(c); mapping.valueEl = c; }
  if (c.getAttribute('Tr') === 'string' && val) c.removeAttribute('Tr');
  c.textContent = val;
  mapping.value = val;
}
function setSourceSql(source, val) { if (source.sqlEl) { source.sqlEl.textContent = val; source.sql = val; } }
function setVariableValue(v, val) { _setChildText(v.el, 'Value', val); v.value = val; }

// ---- Serialize back to XML string ----
function serializePorter(doc) {
  const xml = new XMLSerializer().serializeToString(doc);
  // Keep the declaration + comment header the EDM importer expects
  if (xml.startsWith('<?xml')) return xml;
  return '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n' + xml;
}

Object.assign(window, {
  edmParse: _xmlParse,
  buildPorterModel,
  procMeta,
  porterBestPractice,
  setStepEnabled, setStepPrecedence, setStepDescription,
  setMappingValue, setSourceSql, setVariableValue,
  serializePorter,
});
