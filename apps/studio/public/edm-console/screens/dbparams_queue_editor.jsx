// ============================================================
// Message Queue editor — fully type-driven
//   Recreates the legacy "Message Queue Properties" dialog.
//   The Queue Type selector drives which fields appear; each
//   broker has its own field set, defaults, help text & notes.
//   Exposes window.DbpQueueEditorRich (used by the dispatcher).
// ============================================================
const qToast = (m, k) => window.ruleToast && window.ruleToast(m, k);

const QENCODINGS = ['UTF8-BOM', 'UTF-8', 'Unicode (UTF-16)', 'ASCII', 'Windows-1252'];
const QUEUE_TYPES_FULL = [
  'Database', 'ActiveMQ', 'Amazon SQS', 'Kafka', 'MSMQ', 'OracleAQ',
  'RabbitMQ Send', 'SolaceMQ', 'SonicMQ', 'Tibco EMS', 'Tibco Rendezvous', 'WebSphereMQ Pre-V7',
];

// Per-type field schema. Each schema is an array of "blocks":
//   { k:'grid',  fields:[...] }            → 2-col field grid
//   { k:'panel', title, toggle?, fields }  → bordered sub-card (toggle = gating checkbox key)
//   { k:'checks', fields:[...] }           → inline checkbox row
// Field: { key,label,type,def,help,options,full,req,placeholder,showIf,refresh,suffix }
const QUEUE_SCHEMAS = {
  Database: [
    { k: 'grid', fields: [
      { key: 'queueName', label: 'Queue name', type: 'text', full: true, req: true, refresh: true,
        help: 'The physical queue in the EDM database. Refresh to list existing queues; Test to verify it exists.' },
      { key: 'messageBatchSize', label: 'Message batch size', type: 'number', placeholder: '10000',
        help: 'Default 10000 messages per batch.' },
      { key: 'messageReadSize', label: 'Message read size', type: 'number', placeholder: '1000',
        help: 'Default 1000 messages per read.' },
    ] },
  ],
  ActiveMQ: [
    { k: 'grid', fields: [
      { key: 'hostName', label: 'Host name', type: 'text', req: true, placeholder: 'broker.example.com' },
      { key: 'port', label: 'Port', type: 'number',
        help: 'When unset, set automatically from Enable SSL (non-ssl 61616 / ssl 61617). You can also override the port as part of the host name, e.g. MyHostName:1234.' },
      { key: 'queueName', label: 'Queue name', type: 'text', req: true },
      { key: 'username', label: 'User name', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'ackMode', label: 'Acknowledgement mode', type: 'select', def: 'Auto',
        options: ['Auto', 'Client', 'Dups OK', 'Transacted'] },
      { key: 'deliveryMode', label: 'Delivery mode', type: 'select', def: 'Persistent',
        options: ['Persistent', 'Non-Persistent'] },
      { key: 'encoding', label: 'Encoding', type: 'select', def: 'UTF8-BOM', options: QENCODINGS },
    ] },
    { k: 'panel', title: 'SSL', fields: [
      { key: 'enableSsl', label: 'Enable SSL', type: 'check' },
      { key: 'acceptInvalidCert', label: 'Accept invalid certificate', type: 'check' },
      { key: 'customString', label: 'Custom string', type: 'check' },
    ] },
    { k: 'panel', title: 'Failover setting', fields: [
      { key: 'maxReconnectDelay', label: 'Max reconnect delay (ms)', type: 'number' },
      { key: 'maxReconnectAttempt', label: 'Max reconnect attempt', type: 'number',
        help: 'Max reconnect attempts before an error is sent back to the client. When unset: ActiveMQ 5.6+ −1 (retry forever); older versions 0 (connect once, disabling reconnection).' },
      { key: 'randomize', label: 'Randomize', type: 'check' },
      { key: 'priorityBackup', label: 'Priority backup', type: 'check' },
    ] },
  ],
  'Amazon SQS': [
    { k: 'checks', fields: [
      { key: 'authMode', label: 'Authentication', type: 'radio', def: 'Profile Details',
        options: ['Profile Details', 'Key Detail'] },
    ] },
    { k: 'grid', fields: [
      { key: 'profileLocation', label: 'Profile location', type: 'text', full: true,
        showIf: v => v.authMode !== 'Key Detail', placeholder: 'C:\\Users\\…\\.aws\\credentials' },
      { key: 'profileName', label: 'Profile name', type: 'text', showIf: v => v.authMode !== 'Key Detail' },
      { key: 'accessKey', label: 'Access key ID', type: 'text', showIf: v => v.authMode === 'Key Detail' },
      { key: 'secretKey', label: 'Secret access key', type: 'password', showIf: v => v.authMode === 'Key Detail' },
      { key: 'region', label: 'Region', type: 'text', placeholder: 'eu-west-1' },
      { key: 'queueUrl', label: 'Queue URL', type: 'text', full: true, req: true,
        placeholder: 'https://sqs.eu-west-1.amazonaws.com/…' },
      { key: 'messageBatchSize', label: 'Message batch size', type: 'number', def: '10000' },
      { key: 'sqsBatchSize', label: 'SQS batch size', type: 'number', def: '0' },
      { key: 'threads', label: 'Threads', type: 'number', def: '1' },
    ] },
    { k: 'checks', fields: [
      { key: 'skipQueueValidation', label: 'Skip queue validation', type: 'check',
        help: 'Will not verify whether the mentioned queue is available on the server. Useful when you don’t have permission to read all queues.' },
    ] },
  ],
  Kafka: [
    { k: 'grid', fields: [
      { key: 'bootstrapServers', label: 'Bootstrap servers', type: 'text', full: true, req: true,
        placeholder: 'host1:9092,host2:9092' },
      { key: 'topic', label: 'Topic', type: 'text', full: true, req: true },
      { key: 'messageBatchSize', label: 'Message batch size', type: 'number',
        help: 'Default 10000, if unspecified. Number of messages produced before sending for some component types.' },
      { key: 'completionTimeout', label: 'Completion timeout (ms)', type: 'number',
        help: 'Default 2500, if unspecified. Max additional time to wait for acknowledgements.' },
      { key: 'encoding', label: 'Encoding', type: 'select', def: 'UTF8-BOM', options: QENCODINGS },
      { key: 'properties', label: 'Properties', type: 'textarea', full: true,
        placeholder: 'key=value (one per line)' },
    ] },
  ],
  MSMQ: [
    { k: 'grid', fields: [
      { key: 'msmqQueueType', label: 'Queue type', type: 'select', def: 'Private', options: ['Private', 'Public'] },
      { key: 'machineName', label: 'Machine name', type: 'text', placeholder: 'HOSTNAME' },
      { key: 'queueName', label: 'Queue name', type: 'text', req: true, refresh: true },
      { key: 'messageFormat', label: 'Message format', type: 'select', def: 'Plain Text',
        options: ['Plain Text', 'Binary', 'XML', 'ActiveX'] },
      { key: 'encoding', label: 'Encoding', type: 'select', def: 'UTF8-BOM', options: QENCODINGS },
    ] },
    { k: 'checks', fields: [
      { key: 'transactional', label: 'Transactional', type: 'check' },
      { key: 'skipQueueValidation', label: 'Skip queue validation', type: 'check' },
    ] },
  ],
  OracleAQ: [
    { k: 'grid', fields: [
      { key: 'hostIp', label: 'Host IP', type: 'text', req: true },
      { key: 'port', label: 'Port', type: 'number', def: '1521' },
      { key: 'serviceName', label: 'Service name', type: 'text', req: true },
      { key: 'userName', label: 'User name', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'queueOwner', label: 'Queue owner', type: 'text' },
      { key: 'queueName', label: 'Queue name', type: 'text', req: true },
      { key: 'encoding', label: 'Encoding', type: 'select', def: 'UTF8-BOM', options: QENCODINGS },
    ] },
  ],
  'RabbitMQ Send': [
    { k: 'grid', fields: [
      { key: 'hostNames', label: 'Host name(s)', type: 'text', full: true, req: true,
        help: 'One or more comma-separated host names.' },
      { key: 'redirects', label: 'Redirects', type: 'number', def: '1' },
      { key: 'virtualHost', label: 'Virtual host', type: 'text' },
      { key: 'exchange', label: 'Exchange', type: 'text' },
      { key: 'routingKey', label: 'Routing key', type: 'text' },
      { key: 'userName', label: 'User name', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'persistent', label: 'Persistent', type: 'select', def: 'Yes', options: ['Yes', 'No'] },
      { key: 'encoding', label: 'Encoding', type: 'select', def: 'UTF8-BOM', options: QENCODINGS },
    ] },
    { k: 'panel', title: 'SSL', toggle: 'useSsl', fields: [
      { key: 'useSsl', label: 'Use SSL', type: 'check' },
      { key: 'sslServerName', label: 'SSL server name', type: 'text', full: true },
      { key: 'sslCertPath', label: 'SSL certificate path', type: 'text', full: true },
      { key: 'sslCertPassphrase', label: 'SSL certificate passphrase', type: 'password', full: true },
      { key: 'allowInvalidServerCert', label: 'Allow invalid server certificate', type: 'check' },
    ] },
    { k: 'panel', title: 'Confirmations', toggle: 'enableConfirmations', fields: [
      { key: 'enableConfirmations', label: 'Enable confirmations', type: 'check' },
      { key: 'confirmationTimeout', label: 'Confirmation timeout (ms)', type: 'number', def: '0' },
    ] },
  ],
  SolaceMQ: [
    { k: 'grid', fields: [
      { key: 'solaceQueueType', label: 'Queue type', type: 'select', def: 'Queue', options: ['Queue', 'Topic'] },
      { key: 'messageType', label: 'Message type', type: 'select', def: 'Binary',
        options: ['Binary', 'Text', 'Map', 'Stream'] },
      { key: 'hostName', label: 'Host name', type: 'text', req: true },
      { key: 'userName', label: 'User name', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'queueName', label: 'Queue name', type: 'text', req: true },
      { key: 'vpnName', label: 'VPN name', type: 'text' },
      { key: 'encoding', label: 'Encoding', type: 'select', def: 'UTF8-BOM', options: QENCODINGS },
      { key: 'timeToLive', label: 'Time to live (ms)', type: 'number' },
    ] },
    { k: 'checks', fields: [
      { key: 'waitForAck', label: 'Wait for ack', type: 'check' },
      { key: 'publishAsDmq', label: 'Publish as DMQ (Dead Message Queue)-eligible', type: 'check' },
    ] },
  ],
  SonicMQ: [
    { k: 'grid', fields: [
      { key: 'userName', label: 'User name', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'brokerUrls', label: 'Broker URLs', type: 'text', full: true, req: true,
        placeholder: 'tcp://host:2506' },
      { key: 'queueName', label: 'Queue name', type: 'text', req: true },
      { key: 'encoding', label: 'Encoding', type: 'select', def: 'UTF8-BOM', options: QENCODINGS },
    ] },
  ],
  'Tibco EMS': [
    { k: 'grid', fields: [
      { key: 'emsQueueType', label: 'Queue type', type: 'select', def: 'Queue', options: ['Queue', 'Topic'] },
      { key: 'serverName', label: 'Server name', type: 'text', req: true },
      { key: 'port', label: 'Port', type: 'number', def: '7222' },
      { key: 'queueTopicName', label: 'Queue / Topic name', type: 'text', req: true },
      { key: 'userName', label: 'User name', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'ackType', label: 'Acknowledgement type', type: 'select', def: 'AUTO',
        options: ['AUTO', 'CLIENT', 'DUPS_OK', 'EXPLICIT_CLIENT', 'NO_ACK'] },
      { key: 'deliveryMode', label: 'Delivery mode', type: 'select', def: 'Persistent',
        options: ['Persistent', 'Non-Persistent', 'Reliable'] },
    ] },
    { k: 'checks', fields: [
      { key: 'transactional', label: 'Transactional', type: 'check' },
    ] },
    { k: 'panel', title: 'SSL', toggle: 'useSsl', fields: [
      { key: 'useSsl', label: 'Use SSL', type: 'check' },
      { key: 'targetHostname', label: 'Target hostname', type: 'text', full: true },
      { key: 'trustedCertFiles', label: 'Trusted certificate files', type: 'text', full: true,
        help: 'Comma-delimited list of trusted certificate files.' },
      { key: 'clientIdentityFile', label: 'Client identity file', type: 'text', full: true },
      { key: 'clientIdentityPassword', label: 'Client identity password', type: 'password', full: true },
    ] },
  ],
  'Tibco Rendezvous': [
    { k: 'panel', title: 'Network connection', fields: [
      { key: 'service', label: 'Service', type: 'text' },
      { key: 'network', label: 'Network', type: 'text' },
      { key: 'daemon', label: 'Daemon', type: 'text' },
    ] },
    { k: 'panel', title: 'Data', fields: [
      { key: 'subject', label: 'Subject', type: 'text', req: true },
      { key: 'fieldName', label: 'Field name', type: 'text' },
    ] },
    { k: 'panel', title: 'Confirmed messages', toggle: 'useConfirmedMessages', fields: [
      { key: 'useConfirmedMessages', label: 'Use confirmed messages', type: 'check', def: true },
      { key: 'confirmName', label: 'Confirm name', type: 'text', full: true },
    ] },
  ],
  'WebSphereMQ Pre-V7': [
    { k: 'grid', fields: [
      { key: 'wmqQueueType', label: 'Queue type', type: 'select', def: 'Local',
        options: ['Local', 'Remote', 'Model', 'Cluster'] },
      { key: 'persistence', label: 'Persistence', type: 'select', def: 'Server Default',
        options: ['Server Default', 'Persistent', 'Not Persistent'] },
      { key: 'queueManager', label: 'Queue manager', type: 'text' },
      { key: 'queueChannel', label: 'Queue channel', type: 'text',
        showIf: v => v.wmqQueueType === 'Remote' || v.wmqQueueType === 'Cluster' },
      { key: 'machineName', label: 'Machine name', type: 'text',
        showIf: v => v.wmqQueueType === 'Remote' || v.wmqQueueType === 'Cluster' },
      { key: 'queuePort', label: 'Queue port', type: 'number', def: '1414',
        showIf: v => v.wmqQueueType === 'Remote' || v.wmqQueueType === 'Cluster' },
      { key: 'queueName', label: 'Queue name', type: 'text', req: true },
      { key: 'messageFormat', label: 'Message format', type: 'select', def: 'MQ_STRING',
        options: ['MQ_STRING', 'MQ_NONE'] },
      { key: 'encoding', label: 'Encoding', type: 'select', def: 'UTF8-BOM', options: QENCODINGS },
      { key: 'messageBodyStartsAt', label: 'Message body starts at character', type: 'number', def: '0' },
      { key: 'sslKeystorePath', label: 'SSL keystore path', type: 'text', full: true },
      { key: 'sslCipherSpec', label: 'SSL cipher spec', type: 'text' },
    ] },
  ],
};

const QUEUE_NOTES = {
  ActiveMQ: [
    'Port — when unset automatically sets the port number based on Enable SSL (non-ssl 61616, ssl 61617). You can also override the port as part of the host name, e.g. MyHostName:1234.',
    'Max Reconnect Attempt — max number of reconnect attempts before an error is sent back to the client. Special defaults apply when unset: ActiveMQ 5.6+ −1 (retry forever); older versions 0 (connect once, disabling re-connection).',
  ],
  'Amazon SQS': ['‘Skip Queue Validation’ will not verify whether the mentioned queue is available on the server. Useful when you don’t have permission to read all queues.'],
  Kafka: ['Maximum 10 — 256kb is the max size for sending a message in a batch, so set this option accordingly. For example, if the size of a single message is 100kb this value should be 2.'],
  MSMQ: [
    'Process Launcher queues should use PlainText formatting and Unicode encoding.',
    'Queues only need setting as transactional if they are transactional, private and remote.',
    '‘Skip Queue Validation’ will not verify whether the mentioned queue is available on the server. Useful when you don’t have permission to read all queues.',
  ],
  SolaceMQ: ['Topic / Queue name is not considered while testing the connection. An invalid or unavailable queue name is only detected while sending data.'],
  'WebSphereMQ Pre-V7': ['Process Launcher queues should use MQ_STRING formatting and Unicode encoding.'],
};

// Which field carries the "primary identifier" used for validation messaging.
const QUEUE_PRIMARY = {
  Database: 'queueName', ActiveMQ: 'queueName', 'Amazon SQS': 'queueUrl', Kafka: 'topic',
  MSMQ: 'queueName', OracleAQ: 'queueName', 'RabbitMQ Send': 'hostNames', SolaceMQ: 'queueName',
  SonicMQ: 'queueName', 'Tibco EMS': 'queueTopicName', 'Tibco Rendezvous': 'subject',
  'WebSphereMQ Pre-V7': 'queueName',
};

function collectFields(schema) {
  const out = [];
  schema.forEach(b => (b.fields || []).forEach(f => out.push(f)));
  return out;
}
function defaultsFor(qtype) {
  const o = {};
  collectFields(QUEUE_SCHEMAS[qtype] || []).forEach(f => {
    o[f.key] = f.def != null ? f.def : (f.type === 'check' ? false : '');
  });
  return o;
}

function QField({ f, vals, set, locked }) {
  if (f.showIf && !f.showIf(vals)) return null;
  const v = vals[f.key];
  const common = { disabled: locked, value: v ?? '', onChange: e => set(f.key, e.target.value) };
  if (f.type === 'check') {
    return (
      <DbpField full={f.full} help={f.help}>
        <label className="dbp-check-inline" onClick={() => !locked && set(f.key, !v)}>
          <span className={`dbp-cbx ${v ? 'on' : ''}`}><IcCheck size={11} /></span>
          <span className="t">{f.label}</span>
        </label>
      </DbpField>
    );
  }
  if (f.type === 'radio') {
    return (
      <DbpField label={f.label} full help={f.help}>
        <div className="hstack" style={{ gap: 18 }}>
          {f.options.map(o => (
            <label key={o} className="radio" onClick={() => !locked && set(f.key, o)}>
              <input type="radio" readOnly checked={v === o} disabled={locked} />
              <span className="rdot" /> {o}
            </label>
          ))}
        </div>
      </DbpField>
    );
  }
  if (f.type === 'select') {
    return (
      <DbpField label={f.label} required={f.req} full={f.full} help={f.help}>
        <div className="select-wrap">
          <select className="select" {...common}>
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </DbpField>
    );
  }
  if (f.type === 'textarea') {
    return (
      <DbpField label={f.label} required={f.req} full={f.full} help={f.help}>
        <textarea className="textarea mono-in" style={{ minHeight: 84 }} placeholder={f.placeholder} {...common} />
      </DbpField>
    );
  }
  // text / password / number
  const inputType = f.type === 'password' ? 'password' : 'text';
  const onChange = f.type === 'number'
    ? e => set(f.key, e.target.value.replace(/[^\d]/g, ''))
    : common.onChange;
  if (f.refresh) {
    return (
      <DbpField label={f.label} required={f.req} full={f.full} help={f.help}>
        <div className="dbp-test-row">
          <input className="input mono-in" disabled={locked} value={v ?? ''} placeholder={f.placeholder} onChange={onChange} />
          <button className="btn" disabled={locked} onClick={() => qToast('Refreshed queue list', 'info')}><IcRefresh2 size={14} /> Refresh</button>
        </div>
      </DbpField>
    );
  }
  return (
    <DbpField label={f.label} required={f.req} full={f.full} help={f.help}>
      <input className={`input ${f.type === 'number' || f.type === 'password' ? 'mono-in' : ''}`}
             type={inputType} disabled={locked} value={v ?? ''} placeholder={f.placeholder} onChange={onChange} />
    </DbpField>
  );
}

function QBlock({ block, vals, set, locked }) {
  if (block.k === 'grid') {
    return <div className="dbp-form2">{block.fields.map(f => <QField key={f.key} f={f} vals={vals} set={set} locked={locked} />)}</div>;
  }
  if (block.k === 'checks') {
    // radios render full; checkboxes inline
    const hasRadio = block.fields.some(f => f.type === 'radio');
    if (hasRadio) return <div className="dbp-form2">{block.fields.map(f => <QField key={f.key} f={f} vals={vals} set={set} locked={locked} />)}</div>;
    return (
      <div className="dbp-qchecks">
        {block.fields.map(f => <QField key={f.key} f={f} vals={vals} set={set} locked={locked} />)}
      </div>
    );
  }
  if (block.k === 'panel') {
    const gated = block.toggle;
    const on = !gated || vals[block.toggle];
    return (
      <div className="dbp-qpanel">
        <div className="dbp-qpanel-h">{block.title}</div>
        <div className={`dbp-form2 ${gated && !on ? 'dbp-panel-off' : ''}`}>
          {block.fields.map(f => {
            // The gating checkbox itself stays enabled; the rest disable when off.
            const isToggle = gated && f.key === block.toggle;
            return <QField key={f.key} f={f} vals={vals} set={set} locked={locked || (gated && !on && !isToggle)} />;
          })}
        </div>
      </div>
    );
  }
  return null;
}

function DbpQueueEditorRich({ row, onClose, onSave }) {
  const isNew = !row;
  const [name, setName] = React.useState(row?.name || '');
  const [qtype, setQtype] = React.useState(row?.qtype || 'Database');
  const [cfgByType, setCfgByType] = React.useState(() => {
    // seed the starting type's config from the row (back-compat with old shape)
    const base = {};
    const start = row?.qtype || 'Database';
    base[start] = { ...defaultsFor(start), ...(row?.cfg || {}) };
    if (row && !row.cfg) {
      // migrate legacy flat fields
      if (row.queue) base[start].queueName = row.queue;
      if (row.batch) base[start].messageBatchSize = row.batch;
      if (row.readCount) base[start].messageReadSize = row.readCount;
    }
    return base;
  });
  const [newQ, setNewQ] = React.useState('');
  const [test, runTest] = useTest();

  const schema = QUEUE_SCHEMAS[qtype] || [];
  const vals = cfgByType[qtype] || defaultsFor(qtype);
  const notes = QUEUE_NOTES[qtype] || [];

  function set(key, value) {
    setCfgByType(prev => ({ ...prev, [qtype]: { ...(prev[qtype] || defaultsFor(qtype)), [key]: value } }));
  }
  function switchType(t) {
    setCfgByType(prev => prev[t] ? prev : { ...prev, [t]: defaultsFor(t) });
    setQtype(t);
  }

  const primaryKey = QUEUE_PRIMARY[qtype];
  const primaryOk = !primaryKey || String(vals[primaryKey] ?? '').trim();
  const valid = name.trim() && primaryOk;

  function save() {
    onSave({ ...(row || {}), name: name.trim(), qtype, cfg: vals,
      queue: vals.queueName || vals.queueTopicName || vals.topic || '' });
  }

  return (
    <DbpModal
      title={isNew ? 'New message queue' : 'Edit message queue'} icon="IcLayers"
      size={schema.some(b => b.k === 'panel') ? 'dbp-edit-lg' : 'dbp-edit-md'}
      sub="Queue used to pass messages between EDM processes. Fields change with the selected queue type."
      onClose={onClose}
      footL={
        <React.Fragment>
          <button className="btn" disabled={test === 'testing'}
                  onClick={() => runTest('Queue connection succeeded')}><IcLightning size={14} /> Test connection</button>
          <TestState state={test} />
        </React.Fragment>
      }
      footR={
        <React.Fragment>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!valid} onClick={save}>{isNew ? 'Add queue' : 'Save'}</button>
        </React.Fragment>
      }>
      {/* identity row — always present */}
      <div className="dbp-form2">
        <DbpField label="Name" required>
          <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Exceptions" />
        </DbpField>
        <DbpField label="Queue type" help="Choosing a type shows only the settings that type supports.">
          <div className="select-wrap">
            <select className="select" value={qtype} onChange={e => switchType(e.target.value)}>
              {QUEUE_TYPES_FULL.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </DbpField>
      </div>

      <div className="dbp-sec-label">{qtype} properties</div>
      {schema.map((block, i) => <QBlock key={i} block={block} vals={vals} set={set} locked={false} />)}

      {/* Database type keeps the queue-management tools */}
      {qtype === 'Database' && (
        <React.Fragment>
          <div className="dbp-sec-label">Queue management</div>
          <div className="dbp-qm">
            <div className="dbp-qm-row">
              <span className="dbp-qm-lbl">Create queue</span>
              <input className="input mono-in" value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="New queue name" />
              <button className="btn" disabled={!newQ.trim()} onClick={() => { qToast(`Queue “${newQ.trim()}” created`, 'success'); setNewQ(''); }}><IcPlus size={14} /> Create</button>
            </div>
            <div className="dbp-qm-row">
              <span className="dbp-qm-lbl">Remove queue</span>
              <div className="select-wrap" style={{ flex: 1 }}>
                <select className="select" defaultValue=""><option value="" disabled>Select a queue…</option><option>{vals.queueName || 'Exceptions'}</option></select>
              </div>
              <button className="btn" onClick={() => qToast('Queue deleted', 'info')}><IcTrash size={13} /> Delete</button>
              <button className="btn" onClick={() => qToast('All messages removed from queue', 'info')}>Purge messages</button>
            </div>
          </div>
        </React.Fragment>
      )}

      {notes.length > 0 && (
        <div className="dbp-qnotes">
          <div className="dbp-qnotes-h"><IcInfo size={13} /> Notes</div>
          <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </DbpModal>
  );
}

window.DbpQueueEditorRich = DbpQueueEditorRich;
window.QUEUE_TYPES_FULL = QUEUE_TYPES_FULL;
