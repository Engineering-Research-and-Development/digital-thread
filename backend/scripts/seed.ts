/**
 * Seed script — loads all Digital Thread mock data into the SQLite database.
 * Run: npm run seed
 */
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as nodePath from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Digital Thread database...\n')

  // ── Partners ──────────────────────────────────────────────────────────────
  // `country` is the mandatory ISO 3166-1 alpha-2 code. Codes for the "to be
  // confirmed" partners are best-effort placeholders — editable from the
  // Profile page / Settings → Partners UI.
  const partners = [
    { id: 'p-cai',     name: 'CAI',     fullName: 'Collins Aerospace Ireland',            country: 'IE', color: '#60A5FA', role: 'Design Authority & Integration' },
    { id: 'p-aimplas', name: 'AIMPLAS', fullName: 'Instituto Tecnológico del Plástico',   country: 'ES', color: '#34D399', role: 'Materials & Recycling' },
    { id: 'p-ens',     name: 'ENS',     fullName: 'Enstruckt / Simulation Partner',        country: 'DE', color: '#A78BFA', role: 'Process Simulation' },
    { id: 'p-aim',     name: 'AIM',     fullName: 'AIM3D / Manufacturing Partner',         country: 'DE', color: '#F97316', role: 'ATL Manufacturing' },
    { id: 'p-msq',     name: 'MSQ',     fullName: 'M&S Quality Engineering',              country: 'ES', color: '#F59E0B', role: 'Quality & Repair' },
    { id: 'p-imd',     name: 'IMD',     fullName: 'IMD NDT Solutions',                    country: 'ES', color: '#EC4899', role: 'NDI & AI Detection' },
    { id: 'p-idk',     name: 'IDK',     fullName: 'IDK Inspection',                       country: 'DE', color: '#14B8A6', role: 'NDI Scanning' },
    { id: 'p-ntnu',    name: 'NTNU',    fullName: 'Norwegian University of Science and Technology', country: 'NO', color: '#6366F1', role: 'Repair Research' },
    { id: 'p-ipt',     name: 'IPT',     fullName: 'Instituto de Pesquisa Tecnológica',    country: 'PT', color: '#84CC16', role: 'End-of-Life / Recycling' },
    // Partners referenced by the demo workflows but not yet in the consortium
    // registry — fullName/role/country to be confirmed. Needed for the UC
    // manual-upload test machine below.
    { id: 'p-ucb',     name: 'UCB',     fullName: 'UCB (to be confirmed)',                country: 'BE', color: '#0EA5E9', role: 'Digital Representation / AAS' },
    { id: 'p-zie',     name: 'ZIE',     fullName: 'ZIE (to be confirmed)',                country: 'PL', color: '#F43F5E', role: 'MRO / In-service' },
    { id: 'p-ensam',   name: 'ENSAM',   fullName: 'Arts et Métiers — ENSAM (to be confirmed)', country: 'FR', color: '#22D3EE', role: 'Recycling & Materials QA' },
  ]

  for (const p of partners) {
    await prisma.partner.upsert({ where: { id: p.id }, update: p, create: p })
  }
  console.log(`✅ ${partners.length} partners`)

  // ── Users ─────────────────────────────────────────────────────────────────
  const adminPassword   = await bcrypt.hash('admin123',    10)
  const ownerPassword   = await bcrypt.hash('owner123',    10)
  const partnerPassword = await bcrypt.hash('partner123',  10)

  // Three-tier RBAC: SUPERADMIN, OWNER, OPERATOR.
  const users = [
    { id: 'u-superadmin', email: 'admin@compstlar.eu',     hashedPassword: adminPassword,   fullName: 'Platform Admin',    role: 'SUPERADMIN', partnerId: null },
    // OWNER is a partner-scoped operator (must have a partnerId). Bound to CAI
    // (Design Authority & Integration) — the natural "owner/integrator".
    { id: 'u-owner',      email: 'owner@compstlar.eu',     hashedPassword: ownerPassword,   fullName: 'DT Workflow Owner', role: 'OWNER',      partnerId: 'p-cai' },
    { id: 'u-cai-op',     email: 'operator@cai.eu',        hashedPassword: partnerPassword, fullName: 'CAI Operator',      role: 'OPERATOR',    partnerId: 'p-cai' },
    { id: 'u-aimplas',    email: 'operator@aimplas.eu',    hashedPassword: partnerPassword, fullName: 'AIMPLAS Operator',  role: 'OPERATOR',    partnerId: 'p-aimplas' },
    // One PARTNER operator per consortium partner — required to exercise row-level
    // partner scope (PartnerScopeGuard) in the UC manual-upload test machine.
    { id: 'u-ens-op',     email: 'operator@ens.eu',        hashedPassword: partnerPassword, fullName: 'ENS Operator',      role: 'OPERATOR',    partnerId: 'p-ens' },
    { id: 'u-aim-op',     email: 'operator@aim.eu',        hashedPassword: partnerPassword, fullName: 'AIM Operator',      role: 'OPERATOR',    partnerId: 'p-aim' },
    { id: 'u-msq-op',     email: 'operator@msq.eu',        hashedPassword: partnerPassword, fullName: 'MSQ Operator',      role: 'OPERATOR',    partnerId: 'p-msq' },
    { id: 'u-imd-op',     email: 'operator@imd.eu',        hashedPassword: partnerPassword, fullName: 'IMD Operator',      role: 'OPERATOR',    partnerId: 'p-imd' },
    { id: 'u-idk-op',     email: 'operator@idk.eu',        hashedPassword: partnerPassword, fullName: 'IDK Operator',      role: 'OPERATOR',    partnerId: 'p-idk' },
    { id: 'u-ntnu-op',    email: 'operator@ntnu.eu',       hashedPassword: partnerPassword, fullName: 'NTNU Operator',     role: 'OPERATOR',    partnerId: 'p-ntnu' },
    { id: 'u-ipt-op',     email: 'operator@ipt.eu',        hashedPassword: partnerPassword, fullName: 'IPT Operator',      role: 'OPERATOR',    partnerId: 'p-ipt' },
    { id: 'u-ucb-op',     email: 'operator@ucb.eu',        hashedPassword: partnerPassword, fullName: 'UCB Operator',      role: 'OPERATOR',    partnerId: 'p-ucb' },
    { id: 'u-zie-op',     email: 'operator@zie.eu',        hashedPassword: partnerPassword, fullName: 'ZIE Operator',      role: 'OPERATOR',    partnerId: 'p-zie' },
    { id: 'u-ensam-op',   email: 'operator@ensam.eu',      hashedPassword: partnerPassword, fullName: 'ENSAM Operator',    role: 'OPERATOR',    partnerId: 'p-ensam' },
  ]

  for (const u of users) {
    await prisma.user.upsert({ where: { id: u.id }, update: u, create: u })
  }
  console.log(`✅ ${users.length} users`)
  console.log(`   superadmin: admin@compstlar.eu / admin123`)
  console.log(`   owner:      owner@compstlar.eu / owner123 (partner: CAI)`)
  console.log(`   partner:    operator@cai.eu / partner123`)

  // ── Products ─────────────────────────────────────────────────────────────
  // Minimal registry: globally-unique urn + name + owning Partner. Iterations
  // attach to a Product; OWNER sees own-partner products, SUPERADMIN sees all.
  const products = [
    // urn matches the demo iterations' legacy metadata.componentRef so the
    // ComponentPassport/DPP (componentRef-based) and the new productId both resolve.
    { id: 'prod-wing-panel',  urn: 'urn:digital-thread:component:wing-panel-42',  name: 'Composite Wing Panel',        description: 'Thermoplastic composite wing access panel (UC1–UC4 reference component).', ownerPartnerId: 'p-cai' },
    { id: 'prod-fuselage-frame', urn: 'urn:digital-thread:product:fuselage-frame-002', name: 'Fuselage Frame Section', description: 'Recyclable Gr-TP fuselage frame demonstrator.', ownerPartnerId: 'p-cai' },
    { id: 'prod-mat-coupon',  urn: 'urn:digital-thread:product:mat-coupon-003',  name: 'Material Test Coupon',        description: 'Standardised material characterisation coupon.', ownerPartnerId: 'p-aimplas' },
  ]
  for (const pr of products) {
    await prisma.product.upsert({ where: { id: pr.id }, update: pr, create: pr })
  }
  console.log(`✅ ${products.length} products`)

  // ── DataSources ───────────────────────────────────────────────────────────
  const dataSources = [
    {
      id: 'ds-minio',
      name: 'MinIO CAD Storage',
      type: 'FILE_SYSTEM',
      protocol: null,
      endpoint: 'https://minio.digitalthread.local/cad-bucket',
      description: 'Primary object storage for CAD files and design artifacts',
      accessMode: 'PULL',
    },
    {
      id: 'ds-sensor',
      name: 'ATL Sensor Feed (MQTT)',
      type: 'SENSOR',
      protocol: 'MQTT',
      endpoint: 'mqtt://atl-sensors.digitalthread.local:1883',
      description: 'Real-time sensor data from the Automated Tape Laying machine',
      protocolConfigJson: JSON.stringify({ topics: ['atl/telemetry/#', 'atl/pressure/+'], qos: 1, clientId: 'dt-backend', keepAlive: 60 }),
      tagMappingJson: JSON.stringify([
        { sourcePath: '$.temperature', targetInputId: 'sensor-temp' },
        { sourcePath: '$.layupSpeed', targetInputId: 'sensor-speed' },
      ]),
      accessMode: 'PUSH',
    },
    {
      id: 'ds-material-db',
      name: 'Material Database',
      type: 'DATABASE',
      protocol: 'SQL',
      endpoint: 'postgres://materials.digitalthread.local:5432/matdb',
      description: 'Centralised database of material cards and thermoplastic specifications',
      protocolConfigJson: JSON.stringify({ driver: 'postgresql', database: 'matdb', query: 'SELECT * FROM material_cards WHERE updated_at > $lastPoll', pollIntervalMs: 300000 }),
      pollIntervalMs: 300000,
      accessMode: 'PULL',
    },
    {
      id: 'ds-shm-sensors',
      name: 'SHM Sensor Network (OPC-UA)',
      type: 'SENSOR',
      protocol: 'OPC_UA',
      endpoint: 'opc.tcp://shm-gateway.digitalthread.local:4840',
      description: 'Structural Health Monitoring sensor network for in-service monitoring',
      protocolConfigJson: JSON.stringify({ securityMode: 'SignAndEncrypt', nodeIds: ['ns=2;s=SHM.StrainGauge1', 'ns=2;s=SHM.AccelX'], samplingInterval: 1000 }),
      pollIntervalMs: 1000,
      accessMode: 'PUSH',
    },
  ]

  for (const ds of dataSources) {
    await prisma.dataSource.upsert({ where: { id: ds.id }, update: ds, create: ds })
  }
  console.log(`✅ ${dataSources.length} data sources`)

  // ── Node templates ───────────────────────────────────────────────────────
  // Curated palette of pre-configured TASK nodes that appear in the editor's
  // "Domain templates" section. Editable by SUPERADMIN/OWNER via
  // /settings/node-templates. The four generic kinds stay hardcoded in the
  // frontend palette — only domain templates live in the DB.
  const CAD_EXT = ['.step', '.stp', '.iges', '.igs', '.catpart', '.x_t']
  const nodeTemplates = [
    {
      id: 'tpl-design-cad-release',
      slug: 'design.cad-release',
      label: 'CAD Release',
      kind: 'TASK', icon: 'PenTool', color: '#3B82F6',
      description: 'Release of geometric design files to the consortium.',
      tagsJson: JSON.stringify(['design', 'cad']),
      defaultPartnerId: 'p-cai',
      inputsJson: JSON.stringify([
        { id: 'requirements', name: 'Requirements doc', cardinality: 'ONE', required: false, fileTypes: ['.pdf', '.docx'], source: { kind: 'MANUAL' }, description: 'Optional structural/functional requirements driving the design.' },
      ]),
      outputsJson: JSON.stringify([
        { id: 'cad', name: 'Released CAD', cardinality: 'ONE', required: true, fileTypes: CAD_EXT, defaultClassification: 'PARTNER', description: 'STEP / IGES / native CAD file frozen for downstream consumption.' },
      ]),
      sortOrder: 10,
    },
    {
      id: 'tpl-design-material-spec',
      slug: 'design.material-spec',
      label: 'Material specification',
      kind: 'TASK', icon: 'FlaskConical', color: '#3B82F6',
      description: 'Material card with mechanical, thermal and certification data.',
      tagsJson: JSON.stringify(['design', 'materials']),
      defaultPartnerId: 'p-aimplas',
      inputsJson: JSON.stringify([]),
      outputsJson: JSON.stringify([
        { id: 'material-card', name: 'Material card', cardinality: 'ONE', required: true, fileTypes: ['.json', '.xlsx', '.csv'], defaultClassification: 'PARTNER' },
        { id: 'datasheet', name: 'Datasheet', cardinality: 'ONE', required: false, fileTypes: ['.pdf'], defaultClassification: 'INTERNAL' },
      ]),
      sortOrder: 20,
    },
    {
      id: 'tpl-simulation-process',
      slug: 'simulation.process',
      label: 'Process simulation',
      kind: 'TASK', icon: 'Cpu', color: '#3B82F6',
      description: 'FEA / consolidation / forming simulation on the released geometry.',
      tagsJson: JSON.stringify(['simulation']),
      defaultPartnerId: 'p-ens',
      inputsJson: JSON.stringify([
        { id: 'cad', name: 'Geometry', cardinality: 'ONE', required: true, fileTypes: CAD_EXT, source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
        { id: 'material', name: 'Material card', cardinality: 'ONE', required: true, fileTypes: ['.json', '.xlsx'], source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
      ]),
      outputsJson: JSON.stringify([
        { id: 'report', name: 'Simulation report', cardinality: 'ONE', required: true, fileTypes: ['.pdf', '.html'], defaultClassification: 'INTERNAL' },
        { id: 'fields', name: 'Result fields', cardinality: 'MANY', required: false, fileTypes: ['.vtu', '.h5', '.odb', '.npy'], defaultClassification: 'PARTNER' },
      ]),
      sortOrder: 30,
    },
    {
      id: 'tpl-mfg-atl',
      slug: 'mfg.atl',
      label: 'ATL manufacturing',
      kind: 'TASK', icon: 'Wrench', color: '#3B82F6',
      description: 'Automated Tape Laying deposition — physical production with process logs.',
      tagsJson: JSON.stringify(['manufacturing']),
      defaultPartnerId: 'p-aim',
      inputsJson: JSON.stringify([
        { id: 'cad', name: 'Geometry', cardinality: 'ONE', required: true, fileTypes: CAD_EXT, source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
        { id: 'process-params', name: 'Process parameters', cardinality: 'ONE', required: false, fileTypes: ['.json', '.csv'], source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
      ]),
      outputsJson: JSON.stringify([
        { id: 'process-logs', name: 'Process logs', cardinality: 'MANY', required: true, fileTypes: ['.csv', '.parquet'], defaultClassification: 'CONFIDENTIAL' },
        { id: 'as-built', name: 'As-built report', cardinality: 'ONE', required: false, fileTypes: ['.pdf'], defaultClassification: 'PARTNER' },
      ]),
      sortOrder: 40,
    },
    {
      id: 'tpl-qa-ndi',
      slug: 'qa.ndi-inspection',
      label: 'NDI inspection',
      kind: 'TASK', icon: 'ScanSearch', color: '#3B82F6',
      description: 'Non-destructive inspection (ultrasound / XCT) with raw scans and report.',
      tagsJson: JSON.stringify(['quality', 'inspection']),
      defaultPartnerId: 'p-imd',
      inputsJson: JSON.stringify([
        { id: 'as-built', name: 'As-built artifact', cardinality: 'ONE', required: true, fileTypes: ['.pdf', '.csv', '.parquet'], source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
      ]),
      outputsJson: JSON.stringify([
        { id: 'scans', name: 'Raw scans', cardinality: 'MANY', required: true, fileTypes: ['.raw', '.dicom', '.h5'], defaultClassification: 'CONFIDENTIAL' },
        { id: 'report', name: 'Inspection report', cardinality: 'ONE', required: true, fileTypes: ['.pdf', '.json'], defaultClassification: 'PARTNER' },
      ]),
      sortOrder: 50,
    },
    {
      id: 'tpl-qa-ai-defect',
      slug: 'qa.ai-defect',
      label: 'AI defect detection',
      kind: 'TASK', icon: 'Brain', color: '#3B82F6',
      description: 'AI / ML defect mapping over NDI raw scans.',
      tagsJson: JSON.stringify(['quality', 'ai']),
      defaultPartnerId: 'p-imd',
      inputsJson: JSON.stringify([
        { id: 'scans', name: 'NDI scans', cardinality: 'MANY', required: true, fileTypes: ['.raw', '.dicom', '.h5'], source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
      ]),
      outputsJson: JSON.stringify([
        { id: 'defect-map', name: 'Defect map', cardinality: 'ONE', required: true, fileTypes: ['.json', '.npy', '.png'], defaultClassification: 'CONFIDENTIAL' },
      ]),
      sortOrder: 60,
    },
    {
      id: 'tpl-lifecycle-aas-publish',
      slug: 'lifecycle.aas-publish',
      label: 'AAS publish',
      kind: 'TASK', icon: 'Database', color: '#3B82F6',
      description: 'Publish the iteration outputs to the Asset Administration Shell.',
      tagsJson: JSON.stringify(['lifecycle', 'aas']),
      defaultPartnerId: 'p-ucb',
      inputsJson: JSON.stringify([
        { id: 'cad', name: 'CAD', cardinality: 'ONE', required: false, fileTypes: CAD_EXT, source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
        { id: 'reports', name: 'Reports', cardinality: 'MANY', required: false, fileTypes: ['.pdf', '.json'], source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
      ]),
      outputsJson: JSON.stringify([
        { id: 'aas', name: 'AAS package', cardinality: 'ONE', required: true, fileTypes: ['.aasx', '.json', '.xml'], defaultClassification: 'PARTNER' },
      ]),
      sortOrder: 70,
    },
    {
      id: 'tpl-lifecycle-recycling',
      slug: 'lifecycle.recycling-plan',
      label: 'Recycling plan',
      kind: 'TASK', icon: 'Recycle', color: '#3B82F6',
      description: 'End-of-life recycling planning and compliance report.',
      tagsJson: JSON.stringify(['lifecycle', 'recycling']),
      defaultPartnerId: 'p-aimplas',
      inputsJson: JSON.stringify([
        { id: 'aas', name: 'AAS package', cardinality: 'ONE', required: true, fileTypes: ['.aasx', '.json'], source: { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } },
      ]),
      outputsJson: JSON.stringify([
        { id: 'plan', name: 'Recycling plan', cardinality: 'ONE', required: true, fileTypes: ['.pdf', '.docx'], defaultClassification: 'PUBLIC' },
      ]),
      sortOrder: 80,
    },
  ]
  for (const t of nodeTemplates) {
    await prisma.nodeTemplate.upsert({ where: { id: t.id }, update: t, create: t })
  }
  console.log(`✅ ${nodeTemplates.length} node templates`)

  // ── StateMachines ─────────────────────────────────────────────────────────

  // 1. Digital Thread Lifecycle (primary demo machine)
  const smLifecycle = {
    id: 'sm-lifecycle',
    name: 'Digital Thread Lifecycle',
    version: '1.0.0',
    description: 'Full lifecycle digital thread for composite thermoplastic aerospace components — from design through manufacturing, quality inspection, repair, and end-of-life recycling.',
    tags: JSON.stringify(['digital-thread', 'lifecycle', 'full-chain', 'WP2', 'WP3', 'WP4', 'WP5']),
    nodesJson: JSON.stringify([
      { id: 'lc-cad', type: 'MANUAL', nodeTypeId: 'CAD_RELEASE', label: 'CAD Release', description: 'Release STEP/CATPART design files for the composite panel', config: { instructions: 'Upload the final CAD design file', requiredFileTypes: ['.step', '.catpart'], expectedOutput: '.step / .catpart', inputs: [{ id: 'cad-file', label: 'CAD Design File', source: 'MANUAL', required: true, fileTypes: ['.step', '.catpart'] }], outputs: [{ id: 'cad-out', label: 'Released CAD', fileTypes: ['.step', '.catpart'] }] }, position: { x: 80, y: 200 }, responsiblePartner: 'CAI' },
      { id: 'lc-mat', type: 'MANUAL', nodeTypeId: 'MATERIAL_SPEC', label: 'Material Specification', description: 'Define thermoplastic tape material card and specification', config: { instructions: 'Upload material card with resin/fiber properties', requiredFileTypes: ['.json', '.xlsx'], expectedOutput: 'material_card.json', inputs: [{ id: 'mat-card', label: 'Material Card', source: 'MANUAL', required: true, fileTypes: ['.json', '.xlsx'] }, { id: 'mat-db', label: 'Material Properties', source: 'DATASOURCE', dataSourceId: 'ds-material-db', required: false }], outputs: [{ id: 'mat-out', label: 'Material Specification', fileTypes: ['.json'] }] }, position: { x: 350, y: 200 }, responsiblePartner: 'AIMPLAS' },
      { id: 'lc-sim', type: 'AUTOMATIC', nodeTypeId: 'PROCESS_SIM', label: 'Process Simulation', description: 'Run thermoplastic consolidation process simulation', config: { apiEndpoint: '/api/v1/exec/run', timeout: 60000, retryCount: 2, expectedOutput: 'consolidation_report.pdf', inputs: [{ id: 'sim-cad', label: 'CAD Model', source: 'PREDECESSOR', required: true, fileTypes: ['.step'] }, { id: 'sim-mat', label: 'Material Card', source: 'PREDECESSOR', required: true, fileTypes: ['.json'] }], outputs: [{ id: 'sim-out', label: 'Consolidation Report', fileTypes: ['.pdf'] }] }, position: { x: 620, y: 200 }, responsiblePartner: 'ENS' },
      { id: 'lc-mfg', type: 'MANUAL', nodeTypeId: 'ATL_MANUFACTURING', label: 'ATL Manufacturing', description: 'Automated Tape Laying physical deposition process', config: { instructions: 'Complete ATL deposition and upload process data logs', requiredFileTypes: ['.parquet', '.csv'], expectedOutput: 'process_logs.parquet', inputs: [{ id: 'mfg-sim', label: 'Simulation Report', source: 'PREDECESSOR', required: true, fileTypes: ['.pdf'] }, { id: 'mfg-sensor', label: 'Sensor Data', source: 'DATASOURCE', dataSourceId: 'ds-sensor', required: false }, { id: 'mfg-logs', label: 'Process Logs', source: 'MANUAL', required: true, fileTypes: ['.parquet', '.csv'] }], outputs: [{ id: 'mfg-out', label: 'ATL Process Logs', fileTypes: ['.parquet'] }] }, position: { x: 890, y: 200 }, responsiblePartner: 'AIM / MSQ' },
      { id: 'lc-ndi', type: 'MANUAL', nodeTypeId: 'NDI_SCAN', label: 'NDI Inspection', description: 'Non-destructive ultrasound/XCT inspection of manufactured part', config: { instructions: 'Perform C-scan or XCT inspection and upload raw scan data', requiredFileTypes: ['.raw', '.dicom', '.tiff'], expectedOutput: 'ultrasound_scan.raw', inputs: [{ id: 'ndi-mfg', label: 'Manufactured Part Reference', source: 'PREDECESSOR', required: true }, { id: 'ndi-scan', label: 'NDI Scan Data', source: 'MANUAL', required: true, fileTypes: ['.raw', '.dicom', '.tiff'] }], outputs: [{ id: 'ndi-out', label: 'Ultrasound Scan', fileTypes: ['.raw'] }] }, position: { x: 1160, y: 200 }, responsiblePartner: 'IMD / IDK' },
      { id: 'lc-ai', type: 'AUTOMATIC', nodeTypeId: 'AI_DEFECT_DETECTION', label: 'AI Defect Detection', description: 'AI-powered analysis of NDI scan data for defect identification', config: { apiEndpoint: '/api/v1/exec/run', timeout: 90000, retryCount: 1, expectedOutput: 'defect_map.json', inputs: [{ id: 'ai-scan', label: 'NDI Scan Data', source: 'PREDECESSOR', required: true, fileTypes: ['.raw'] }], outputs: [{ id: 'ai-out', label: 'Defect Map', fileTypes: ['.json'] }] }, position: { x: 1430, y: 120 }, responsiblePartner: 'IMD' },
      { id: 'lc-shm', type: 'AUTOMATIC', nodeTypeId: 'SHM_CALIBRATION', label: 'SHM Calibration', description: 'Structural Health Monitoring — calibrate digital twin with sensor data', config: { apiEndpoint: '/api/v1/exec/run', timeout: 45000, expectedOutput: 'digital_twin_config.xml', inputs: [{ id: 'shm-scan', label: 'NDI Scan Data', source: 'PREDECESSOR', required: true }, { id: 'shm-sensor', label: 'SHM Sensor Feed', source: 'DATASOURCE', dataSourceId: 'ds-shm-sensors', required: true }], outputs: [{ id: 'shm-out', label: 'Digital Twin Config', fileTypes: ['.xml'] }] }, position: { x: 1430, y: 300 }, responsiblePartner: 'IMD / AIM' },
      { id: 'lc-repair', type: 'MANUAL', nodeTypeId: 'REPAIRING', label: 'Repairing', description: 'Composite repair process — design and apply patch', config: { instructions: 'Design repair patch and upload patch specification', requiredFileTypes: ['.json', '.step'], expectedOutput: 'patch_design.json', inputs: [{ id: 'repair-defect', label: 'Defect Map', source: 'PREDECESSOR', required: true, fileTypes: ['.json'] }, { id: 'repair-patch', label: 'Patch Design', source: 'MANUAL', required: true, fileTypes: ['.json', '.step'] }], outputs: [{ id: 'repair-out', label: 'Patch Design', fileTypes: ['.json'] }] }, position: { x: 1700, y: 120 }, responsiblePartner: 'AIM / NTNU / MSQ' },
      { id: 'lc-delam', type: 'MANUAL', nodeTypeId: 'DELAMINATION_PROCESS', label: 'Delamination Process', description: 'Controlled delamination for fibre/resin recovery', config: { instructions: 'Execute delamination process and upload recovered material metadata', requiredFileTypes: ['.json'], expectedOutput: 'recovered_material_metadata.json', inputs: [{ id: 'delam-twin', label: 'Digital Twin Config', source: 'PREDECESSOR', required: true }, { id: 'delam-meta', label: 'Recovery Metadata', source: 'MANUAL', required: true, fileTypes: ['.json'] }], outputs: [{ id: 'delam-out', label: 'Recovered Material Metadata', fileTypes: ['.json'] }] }, position: { x: 1700, y: 300 }, responsiblePartner: 'AIM / IPT' },
      { id: 'lc-recycle', type: 'MANUAL', nodeTypeId: 'RECYCLING_PLAN', label: 'Recycling Plan', description: 'End-of-life recycling plan and compliance report', config: { instructions: 'Create recycling plan and upload compliance report', requiredFileTypes: ['.pdf'], expectedOutput: 'recycling_report.pdf', inputs: [{ id: 'recycle-repair', label: 'Repair Report', source: 'PREDECESSOR', required: false }, { id: 'recycle-delam', label: 'Recovery Metadata', source: 'PREDECESSOR', required: false }, { id: 'recycle-plan', label: 'Recycling Plan', source: 'MANUAL', required: true, fileTypes: ['.pdf'] }], outputs: [{ id: 'recycle-out', label: 'Recycling Report', fileTypes: ['.pdf'] }] }, position: { x: 1970, y: 200 }, responsiblePartner: 'AIMPLAS' },
    ]),
    edgesJson: JSON.stringify([
      { id: 'lc-e1', source: 'lc-cad', target: 'lc-mat' },
      { id: 'lc-e2', source: 'lc-mat', target: 'lc-sim' },
      { id: 'lc-e3', source: 'lc-sim', target: 'lc-mfg' },
      { id: 'lc-e4', source: 'lc-mfg', target: 'lc-ndi' },
      { id: 'lc-e5', source: 'lc-ndi', target: 'lc-ai' },
      { id: 'lc-e6', source: 'lc-ndi', target: 'lc-shm' },
      { id: 'lc-e7', source: 'lc-ai', target: 'lc-repair', label: 'Defect Found' },
      { id: 'lc-e8', source: 'lc-shm', target: 'lc-delam', label: 'End of Life' },
      { id: 'lc-e9', source: 'lc-repair', target: 'lc-recycle' },
      { id: 'lc-e10', source: 'lc-delam', target: 'lc-recycle' },
    ]),
    createdAt: new Date('2026-01-10T09:00:00Z'),
    updatedAt: new Date('2026-02-09T10:00:00Z'),
  }

  await prisma.stateMachine.upsert({ where: { id: 'sm-lifecycle' }, update: smLifecycle, create: smLifecycle })

  // 2. Aerostructure R&I Digital Thread
  const smRI = {
    id: 'sm-aero-ri',
    name: 'Aerostructure R&I Digital Thread',
    version: '1.0.0',
    description: 'Digital workflow for advancing the TRL (Technology Readiness Level) of aerostructure composite-material components. Covers TRL 3→6: from concept validation in the laboratory to demonstration in a relevant environment.',
    tags: JSON.stringify(['R&I', 'TRL', 'aerostructure', 'composites', 'research']),
    nodesJson: JSON.stringify([
      { id: 'ri-req', type: 'MANUAL', nodeTypeId: 'REQUIREMENTS_DEF', label: 'Requirements Definition', description: 'Define structural, functional and airworthiness requirements for the component', config: { instructions: 'Document structural and functional requirements. Upload signed requirements specification.', requiredFileTypes: ['.pdf', '.docx'], expectedOutput: 'requirements_spec.pdf', inputs: [], outputs: [{ id: 'req-out', label: 'Requirements Spec', fileTypes: ['.pdf'] }] }, position: { x: 80, y: 200 }, responsiblePartner: 'Design Authority' },
      { id: 'ri-topo', type: 'AUTOMATIC', nodeTypeId: 'TOPOLOGY_OPTIMIZATION', label: 'Topology Optimization', description: 'FEA-driven topology optimization for minimum weight under load constraints', config: { apiEndpoint: '/api/v1/exec/run', timeout: 120000, expectedOutput: 'optimized_topology.step', inputs: [{ id: 'topo-req', label: 'Requirements Spec', source: 'PREDECESSOR', required: true, fileTypes: ['.pdf'] }], outputs: [{ id: 'topo-out', label: 'Optimized Topology', fileTypes: ['.step'] }] }, position: { x: 330, y: 200 }, responsiblePartner: 'Simulation Lab' },
      { id: 'ri-cad', type: 'MANUAL', nodeTypeId: 'CAD_RELEASE', label: 'Detailed CAD Design', description: 'Detailed design of the composite component based on optimized topology', config: { instructions: 'Create detailed CAD model incorporating topology results. Release STEP file.', requiredFileTypes: ['.step', '.catpart'], expectedOutput: 'detailed_design.step', inputs: [{ id: 'cad-topo', label: 'Topology Result', source: 'PREDECESSOR', required: true, fileTypes: ['.step'] }], outputs: [{ id: 'cad-out', label: 'Detailed CAD', fileTypes: ['.step'] }] }, position: { x: 580, y: 200 }, responsiblePartner: 'Design Authority' },
      { id: 'ri-fea', type: 'AUTOMATIC', nodeTypeId: 'FEA_STRUCTURAL', label: 'FEA Structural Analysis', description: 'Full structural finite element analysis under design load cases', config: { apiEndpoint: '/api/v1/exec/run', timeout: 180000, expectedOutput: 'fea_results.h5', inputs: [{ id: 'fea-cad', label: 'Detailed CAD', source: 'PREDECESSOR', required: true, fileTypes: ['.step'] }], outputs: [{ id: 'fea-out', label: 'FEA Results', fileTypes: ['.h5'] }] }, position: { x: 830, y: 200 }, responsiblePartner: 'Simulation Lab' },
      { id: 'ri-fea-gate', type: 'GATEWAY', nodeTypeId: 'QUALITY_GATE', label: 'FEA Acceptance Gate', description: 'Verify FEA results meet minimum margin of safety requirements', config: { gateType: 'AND', condition: 'ALL_INPUTS_PASS' }, position: { x: 1080, y: 200 } },
      { id: 'ri-coupon', type: 'MANUAL', nodeTypeId: 'LAB_COUPON_TEST', label: 'Material Coupon Testing', description: 'Mechanical characterisation of material via standardised coupon tests', config: { instructions: 'Prepare and test material coupons per ASTM/EN standards. Upload test report.', requiredFileTypes: ['.xlsx', '.pdf'], expectedOutput: 'coupon_test_report.xlsx', inputs: [{ id: 'coupon-mat', label: 'Material Specification', source: 'MANUAL', required: true, fileTypes: ['.json', '.xlsx'] }], outputs: [{ id: 'coupon-out', label: 'Coupon Test Report', fileTypes: ['.xlsx'] }] }, position: { x: 1330, y: 80 }, responsiblePartner: 'Materials Lab' },
      { id: 'ri-vtest', type: 'AUTOMATIC', nodeTypeId: 'VIRTUAL_TESTING', label: 'Virtual Testing', description: 'Virtual structural test using digital twin calibrated from FEA', config: { apiEndpoint: '/api/v1/exec/run', timeout: 90000, expectedOutput: 'virtual_test_results.json', inputs: [{ id: 'vtest-fea', label: 'FEA Results', source: 'PREDECESSOR', required: true, fileTypes: ['.h5'] }], outputs: [{ id: 'vtest-out', label: 'Virtual Test Results', fileTypes: ['.json'] }] }, position: { x: 1330, y: 320 }, responsiblePartner: 'Simulation Lab' },
      { id: 'ri-corr-gate', type: 'GATEWAY', nodeTypeId: 'VERSION_SYNC', label: 'Test Correlation Gate', description: 'Verify physical coupon results correlate with virtual test predictions (R²>0.95)', config: { gateType: 'AND', condition: 'ALL_FILES_ALIGNED' }, position: { x: 1580, y: 200 } },
      { id: 'ri-proto', type: 'MANUAL', nodeTypeId: 'PROTOTYPE_MFG', label: 'Prototype Manufacturing', description: 'Manufacture of full-scale research demonstrator', config: { instructions: 'Manufacture prototype per manufacturing plan. Upload quality control report.', requiredFileTypes: ['.pdf', '.xlsx'], expectedOutput: 'manufacturing_report.pdf', inputs: [{ id: 'proto-cad', label: 'Detailed CAD', source: 'PREDECESSOR', required: true, fileTypes: ['.step'] }, { id: 'proto-coupon', label: 'Material Test Report', source: 'PREDECESSOR', required: true }], outputs: [{ id: 'proto-out', label: 'Manufacturing Report', fileTypes: ['.pdf'] }] }, position: { x: 1830, y: 200 }, responsiblePartner: 'Manufacturing' },
      { id: 'ri-struct-test', type: 'MANUAL', nodeTypeId: 'STRUCTURAL_TEST', label: 'Full-Scale Structural Testing', description: 'Physical structural test of demonstrator on test bench under representative loads', config: { instructions: 'Execute structural test per test plan. Upload raw data and test report.', requiredFileTypes: ['.pdf', '.csv', '.hdf5'], expectedOutput: 'structural_test_report.pdf', inputs: [{ id: 'test-proto', label: 'Manufactured Prototype', source: 'PREDECESSOR', required: true }], outputs: [{ id: 'test-out', label: 'Test Report', fileTypes: ['.pdf'] }, { id: 'test-data', label: 'Raw Test Data', fileTypes: ['.csv', '.hdf5'] }] }, position: { x: 2080, y: 200 }, responsiblePartner: 'Test Center' },
      { id: 'ri-dic', type: 'AUTOMATIC', nodeTypeId: 'DIC_STRAIN_FIELD', label: 'DIC Strain Field Measurement', description: 'Digital Image Correlation post-processing for full-field strain analysis', config: { apiEndpoint: '/api/v1/exec/run', timeout: 60000, expectedOutput: 'strain_field.hdf5', inputs: [{ id: 'dic-test', label: 'Test Data', source: 'PREDECESSOR', required: true, fileTypes: ['.csv'] }], outputs: [{ id: 'dic-out', label: 'Strain Field', fileTypes: ['.hdf5'] }] }, position: { x: 2330, y: 120 }, responsiblePartner: 'Test Center' },
      { id: 'ri-analysis', type: 'AUTOMATIC', nodeTypeId: 'AI_DATA_ANALYSIS', label: 'Test Data Analysis', description: 'ML-based analysis of test data for failure mode identification and model updating', config: { apiEndpoint: '/api/v1/exec/run', timeout: 120000, expectedOutput: 'analysis_report.json', inputs: [{ id: 'analysis-dic', label: 'Strain Field', source: 'PREDECESSOR', required: true }, { id: 'analysis-fea', label: 'FEA Results', source: 'PREDECESSOR', required: false }], outputs: [{ id: 'analysis-out', label: 'Analysis Report', fileTypes: ['.json', '.pdf'] }] }, position: { x: 2330, y: 300 }, responsiblePartner: 'Test Center' },
      { id: 'ri-trl', type: 'MANUAL', nodeTypeId: 'TRL_ASSESSMENT', label: 'TRL Assessment', description: 'Formal TRL evaluation against EC/ESA criteria with evidence package', config: { instructions: 'Complete TRL evidence matrix and submit for review board approval.', requiredFileTypes: ['.pdf', '.xlsx'], expectedOutput: 'trl_assessment_report.pdf', inputs: [{ id: 'trl-analysis', label: 'Analysis Report', source: 'PREDECESSOR', required: true }, { id: 'trl-test', label: 'Test Report', source: 'PREDECESSOR', required: true }], outputs: [{ id: 'trl-out', label: 'TRL Assessment Report', fileTypes: ['.pdf'] }] }, position: { x: 2580, y: 200 }, responsiblePartner: 'TRL Review Board' },
      { id: 'ri-aas', type: 'STORAGE', nodeTypeId: 'AAS_UPDATE', label: 'Knowledge Base Update', description: 'Sync all results to AAS — build persistent digital twin of component', config: { outputBucket: 'aas-sync', expectedOutput: 'knowledge_base.aasx' }, position: { x: 2830, y: 100 } },
      { id: 'ri-report', type: 'STORAGE', nodeTypeId: 'REPORT_GEN', label: 'Technical Report', description: 'Generate comprehensive R&I technical report for consortium deliverable', config: { outputBucket: 'reports', reportTemplate: 'ri-technical-report-v1', expectedOutput: 'technical_report.pdf' }, position: { x: 2830, y: 300 } },
    ]),
    edgesJson: JSON.stringify([
      { id: 'ri-e1', source: 'ri-req', target: 'ri-topo' },
      { id: 'ri-e2', source: 'ri-topo', target: 'ri-cad' },
      { id: 'ri-e3', source: 'ri-cad', target: 'ri-fea' },
      { id: 'ri-e4', source: 'ri-fea', target: 'ri-fea-gate' },
      { id: 'ri-e5', source: 'ri-fea-gate', target: 'ri-coupon', label: 'FEA Pass' },
      { id: 'ri-e6', source: 'ri-fea-gate', target: 'ri-vtest', label: 'FEA Pass' },
      { id: 'ri-e7', source: 'ri-coupon', target: 'ri-corr-gate' },
      { id: 'ri-e8', source: 'ri-vtest', target: 'ri-corr-gate' },
      { id: 'ri-e9', source: 'ri-corr-gate', target: 'ri-proto', label: 'Correlation OK' },
      { id: 'ri-e10', source: 'ri-proto', target: 'ri-struct-test' },
      { id: 'ri-e11', source: 'ri-struct-test', target: 'ri-dic' },
      { id: 'ri-e12', source: 'ri-struct-test', target: 'ri-analysis' },
      { id: 'ri-e13', source: 'ri-dic', target: 'ri-trl' },
      { id: 'ri-e14', source: 'ri-analysis', target: 'ri-trl' },
      { id: 'ri-e15', source: 'ri-trl', target: 'ri-aas' },
      { id: 'ri-e16', source: 'ri-trl', target: 'ri-report' },
    ]),
    createdAt: new Date('2026-03-01T09:00:00Z'),
    updatedAt: new Date('2026-03-18T10:00:00Z'),
  }

  await prisma.stateMachine.upsert({ where: { id: 'sm-aero-ri' }, update: smRI, create: smRI })

  // 3. Manual Handoff Demo (Activity 5) — clean all-MANUAL workflow for the mid
  //    review: partners hand off files step by step through the state machine
  //    with manual upload only. No automatic handlers, no data-source ingestion.
  //    Nodes alternate between CAI and AIMPLAS — both have seeded operator
  //    accounts, so a real cross-partner handoff can be demonstrated.
  const smDemo = {
    id: 'sm-demo-manual',
    name: 'Manual Handoff Demo',
    version: '1.0.0',
    description: 'Clean all-manual workflow for the first version (Activity 5) — partners hand off files step by step through the state machine with manual upload. No automatic handlers, no data-source ingestion.',
    tags: JSON.stringify(['demo', 'manual', 'activity-5', 'mid-review']),
    nodesJson: JSON.stringify([
      { id: 'dm-design',   type: 'MANUAL', nodeTypeId: 'CAD_RELEASE',       label: 'Geometric Design',   description: 'Release the geometric design of the composite panel.',        config: { instructions: 'Claim the node, then upload the design file to complete it.',        expectedOutput: 'design.step',             inputs: [], outputs: [{ id: 'dm-design-out',   label: 'Design File' }] },        position: { x: 80,   y: 200 }, responsiblePartner: 'CAI' },
      { id: 'dm-material', type: 'MANUAL', nodeTypeId: 'MATERIAL_SPEC',     label: 'Material Selection', description: 'Select the thermoplastic material and upload the material card.', config: { instructions: 'Claim the node, then upload the material card to complete it.',       expectedOutput: 'material_card.json',      inputs: [], outputs: [{ id: 'dm-material-out', label: 'Material Card' }] },       position: { x: 380,  y: 200 }, responsiblePartner: 'AIMPLAS' },
      { id: 'dm-mfg',      type: 'MANUAL', nodeTypeId: 'ATL_MANUFACTURING', label: 'Manufacturing Plan', description: 'Prepare the manufacturing plan for the panel.',                  config: { instructions: 'Claim the node, then upload the manufacturing plan to complete it.',  expectedOutput: 'manufacturing_plan.pdf',  inputs: [], outputs: [{ id: 'dm-mfg-out',      label: 'Manufacturing Plan' }] },  position: { x: 680,  y: 200 }, responsiblePartner: 'CAI' },
      { id: 'dm-quality',  type: 'MANUAL', nodeTypeId: 'NDI_SCAN',          label: 'Quality Inspection', description: 'Inspect the panel and upload the quality report.',               config: { instructions: 'Claim the node, then upload the quality report to complete it.',      expectedOutput: 'quality_report.pdf',      inputs: [], outputs: [{ id: 'dm-quality-out',  label: 'Quality Report' }] },      position: { x: 980,  y: 200 }, responsiblePartner: 'AIMPLAS' },
      { id: 'dm-handover', type: 'MANUAL', nodeTypeId: 'RECYCLING_PLAN',    label: 'Handover Dossier',   description: 'Compile the final handover dossier for the component.',          config: { instructions: 'Claim the node, then upload the handover dossier to complete it.',    expectedOutput: 'handover_dossier.pdf',    inputs: [], outputs: [{ id: 'dm-handover-out', label: 'Handover Dossier' }] },    position: { x: 1280, y: 200 }, responsiblePartner: 'CAI' },
    ]),
    edgesJson: JSON.stringify([
      { id: 'dm-e1', source: 'dm-design',   target: 'dm-material' },
      { id: 'dm-e2', source: 'dm-material', target: 'dm-mfg' },
      { id: 'dm-e3', source: 'dm-mfg',      target: 'dm-quality' },
      { id: 'dm-e4', source: 'dm-quality',  target: 'dm-handover' },
    ]),
    createdAt: new Date('2026-05-20T09:00:00Z'),
    updatedAt: new Date('2026-05-20T09:00:00Z'),
  }

  await prisma.stateMachine.upsert({ where: { id: 'sm-demo-manual' }, update: smDemo, create: smDemo })

  // 4. UC Manual-Upload Test (v2) — a DAG (not a chain): parallel branches,
  //    AND-gateways and a non-conformity / rework point (mu-inspect). Designed
  //    to exercise manual upload together with data provenance, data lineage
  //    and change-management / non-conformity handling across all 12
  //    consortium partners.
  const SM_UC = 'sm-uc-manual-upload'

  // Each node carries its predecessor data dependencies (preds), which become
  // PREDECESSOR inputs AND FROM_NODE input bindings — that pairing is what
  // makes the lineage engine emit LineageEdge rows on completion.
  const muSpec: {
    id: string; partner: string; label: string; description: string
    fileTypes: string[]; preds: { from: string; label: string }[]; x: number; y: number
  }[] = [
    { id: 'mu-cad',      partner: 'CAI',     label: 'Structural Design',        description: 'UC1 — Structural design & analysis results (CAI). Root of the thread.',                          fileTypes: ['.step', '.stp', '.iges', '.igs', '.json', '.odb'], preds: [], x: 80, y: 250 },
    { id: 'mu-mat',      partner: 'AIMPLAS', label: 'Materials Datasheet',      description: 'UC1 — Materials datasheets, UD Gr-TP data (AMP/AIMPLAS).',                                        fileTypes: ['.xlsx', '.csv', '.dat'],                           preds: [{ from: 'mu-cad', label: 'Released CAD' }], x: 360, y: 90 },
    { id: 'mu-thermo',   partner: 'AIM',     label: 'Thermodynamic Parameters', description: 'UC1 — Thermodynamic parameters (AIM).',                                                           fileTypes: ['.csv', '.json'],                                   preds: [{ from: 'mu-cad', label: 'Released CAD' }], x: 360, y: 250 },
    { id: 'mu-doc',      partner: 'ENS',     label: 'Degree of Consolidation',  description: 'UC1 — AI-based simulations to model the Degree of Consolidation (ENS).',                          fileTypes: ['.csv', '.png', '.jpg'],                            preds: [{ from: 'mu-cad', label: 'Released CAD' }], x: 360, y: 410 },
    { id: 'mu-ml',       partner: 'IMD',     label: 'ML Damage Models',         description: 'UC1 — ML surrogate algorithms & damage-prediction models (IMD). Fan-in of the 3 design inputs.', fileTypes: ['.npy', '.pt', '.h5', '.pkl', '.inp'],              preds: [{ from: 'mu-mat', label: 'Materials Datasheet' }, { from: 'mu-thermo', label: 'Thermodynamic Parameters' }, { from: 'mu-doc', label: 'DoC Results' }], x: 920, y: 250 },
    { id: 'mu-inspect',  partner: 'IDK',     label: 'NDI Inspection Report',    description: 'UC1 — NDI inspection / quality prediction (IDK). Designated NON-CONFORMITY injection point.',     fileTypes: ['.npy', '.mat', '.h5', '.pdf'],                     preds: [{ from: 'mu-ml', label: 'ML Damage Models' }], x: 1200, y: 250 },
    { id: 'mu-vtwin',    partner: 'IMD',     label: 'SHM Virtual Twin',         description: 'UC2 — Virtual twin describing damages of M&M composite laminates (IMD).',                         fileTypes: ['.npy', '.pkl', '.h5', '.json', '.mat'],            preds: [{ from: 'mu-inspect', label: 'NDI Inspection Report' }], x: 1480, y: 40 },
    { id: 'mu-aas',      partner: 'UCB',     label: 'AAS Representation',       description: 'UC2 — Updated AAS representation of the component (UCB).',                                         fileTypes: ['.aasx', '.xml', '.json'],                          preds: [{ from: 'mu-inspect', label: 'NDI Inspection Report' }], x: 1480, y: 150 },
    { id: 'mu-repmodel', partner: 'ENS',     label: 'Repair Models',            description: 'UC3 — Repair models describing materials behaviour during repair (ENS).',                         fileTypes: ['.pdf', '.docx', '.json'],                          preds: [{ from: 'mu-inspect', label: 'NDI Inspection Report' }], x: 1480, y: 260 },
    { id: 'mu-ctrl',     partner: 'MSQ',     label: 'Heating Control Algo',     description: 'UC3 — Optimized control algorithms for the heating blanket (MSQUARE/MSQ).',                       fileTypes: ['.py', '.json', '.pdf'],                            preds: [{ from: 'mu-inspect', label: 'NDI Inspection Report' }], x: 1480, y: 370 },
    { id: 'mu-mro',      partner: 'ZIE',     label: 'MRO Framework',            description: 'UC3 — MRO framework, methodology & guidelines (ZIE).',                                            fileTypes: ['.pdf', '.docx'],                                   preds: [{ from: 'mu-inspect', label: 'NDI Inspection Report' }], x: 1480, y: 480 },
    { id: 'mu-report',   partner: 'NTNU',    label: 'Repair Report',            description: 'UC3 — Repair report (NTNU). Fan-in of the 3 parallel repair branches.',                           fileTypes: ['.pdf', '.docx'],                                   preds: [{ from: 'mu-repmodel', label: 'Repair Models' }, { from: 'mu-ctrl', label: 'Heating Control Algo' }, { from: 'mu-mro', label: 'MRO Framework' }], x: 2040, y: 370 },
    { id: 'mu-quality',  partner: 'ENSAM',   label: 'Recycled QA',              description: 'UC4 — Quality assessment of recycled components (ENSAM). Fan-in of repair + SHM + AAS.',          fileTypes: ['.pdf', '.xlsx'],                                   preds: [{ from: 'mu-report', label: 'Repair Report' }, { from: 'mu-vtwin', label: 'SHM Virtual Twin' }, { from: 'mu-aas', label: 'AAS Representation' }], x: 2600, y: 250 },
    { id: 'mu-recmeta',  partner: 'IPT',     label: 'Recovered Metadata',       description: 'UC4 — Recovered material metadata & tape quality classification (IPT). Final node.',              fileTypes: ['.json', '.csv'],                                   preds: [{ from: 'mu-quality', label: 'Recycled QA' }], x: 2880, y: 250 },
  ]

  const muInputId = (nodeId: string, from: string) => `in--${nodeId}--${from}`
  const muOutputId = (nodeId: string) => `out--${nodeId}`

  // Emit the generic node model. We still set the legacy `type` and
  // `nodeTypeId` fields so the rest of the code (and pre-migration consumers)
  // keep round-tripping cleanly, but the canonical shape is:
  //   kind / name / description / tags / inputs[] / outputs[]
  // where every input has an explicit `source.from = { nodeId, outputId }`.
  const muTaskNodes = muSpec.map((s) => ({
    id: s.id,
    kind: 'TASK',
    name: s.label,
    description: s.description,
    tags: ['uc-manual-upload', s.partner],
    inputs: s.preds.map((p) => ({
      id: muInputId(s.id, p.from),
      name: `${p.label} (from ${p.from})`,
      cardinality: 'ONE',
      required: true,
      fileTypes: s.fileTypes,
      source: { kind: 'PREDECESSOR', from: { nodeId: p.from, outputId: muOutputId(p.from) } },
    })),
    outputs: [{
      id: muOutputId(s.id),
      name: s.label,
      cardinality: 'ONE',
      required: true,
      fileTypes: s.fileTypes,
    }],
    position: { x: s.x, y: s.y },
    responsiblePartner: s.partner,
    // legacy fields for back-compat with un-migrated consumers
    type: 'MANUAL',
    nodeTypeId: s.id.replace(/-/g, '_').toUpperCase(),
    label: s.label,
    config: {
      instructions: `Claim the node, upload the ${s.label} artifact, then complete it.`,
      requiredFileTypes: s.fileTypes,
      expectedOutput: `${s.id}.artifact`,
    },
  }))

  const muGate = (id: string, label: string, x: number, y: number) => ({
    id,
    kind: 'GATEWAY',
    name: label,
    description: 'AND gateway — waits for all parallel predecessors before advancing.',
    gateway: { logic: 'AND' },
    inputs: [],
    outputs: [],
    position: { x, y },
    // legacy
    type: 'GATEWAY',
    nodeTypeId: 'QUALITY_GATE',
    label,
    config: { gateType: 'AND', condition: 'ALL_INPUTS_COMPLETE' },
  })
  const muGateNodes = [
    muGate('mu-gw-design', 'Design Inputs Gate',   640,  250),
    muGate('mu-gw-repair', 'Repair Branches Gate', 1760, 370),
    muGate('mu-gw-eol',    'End-of-Life Gate',     2320, 250),
  ]

  const muEdges = [
    ['mu-cad', 'mu-mat'], ['mu-cad', 'mu-thermo'], ['mu-cad', 'mu-doc'],
    ['mu-mat', 'mu-gw-design'], ['mu-thermo', 'mu-gw-design'], ['mu-doc', 'mu-gw-design'],
    ['mu-gw-design', 'mu-ml'], ['mu-ml', 'mu-inspect'],
    ['mu-inspect', 'mu-vtwin'], ['mu-inspect', 'mu-aas'], ['mu-inspect', 'mu-repmodel'],
    ['mu-inspect', 'mu-ctrl'], ['mu-inspect', 'mu-mro'],
    ['mu-repmodel', 'mu-gw-repair'], ['mu-ctrl', 'mu-gw-repair'], ['mu-mro', 'mu-gw-repair'],
    ['mu-gw-repair', 'mu-report'],
    ['mu-report', 'mu-gw-eol'], ['mu-vtwin', 'mu-gw-eol'], ['mu-aas', 'mu-gw-eol'],
    ['mu-gw-eol', 'mu-quality'], ['mu-quality', 'mu-recmeta'],
  ].map(([source, target], i) => ({ id: `mu-e${i + 1}`, source, target }))

  const smUcManual = {
    id: SM_UC,
    name: 'UC Manual-Upload Test',
    version: '2.0.0',
    description: 'Test workflow for manual upload, data provenance, data lineage and change-management / non-conformity. A DAG with parallel branches, AND gateways and a non-conformity point (mu-inspect). Covers all four CompSTLar reference use cases and all 12 partners.',
    tags: JSON.stringify(['test', 'manual-upload', 'provenance', 'lineage', 'change-mgmt', 'non-conformity', 'parallel', 'all-partners']),
    nodesJson: JSON.stringify([...muTaskNodes, ...muGateNodes]),
    edgesJson: JSON.stringify(muEdges),
    createdAt: new Date('2026-05-22T09:00:00Z'),
    updatedAt: new Date('2026-05-22T12:00:00Z'),
  }
  await prisma.stateMachine.upsert({ where: { id: SM_UC }, update: smUcManual, create: smUcManual })

  // FROM_NODE input bindings — one per predecessor dependency. The binding
  // runtime resolves these into NodeRuntimeState.inputFileStatusesJson, which is
  // the precondition for the lineage engine to emit LineageEdge rows.
  await prisma.inputBinding.deleteMany({ where: { stateMachineId: SM_UC } })
  const muBindings = muSpec.flatMap((s) =>
    s.preds.map((p) => ({
      id: `bind-${s.id}-${p.from}`,
      stateMachineId: SM_UC,
      nodeId: s.id,
      inputId: muInputId(s.id, p.from),
      bindingType: 'FROM_NODE',
      configJson: JSON.stringify({ sourceNodeId: p.from }),
    })),
  )
  await prisma.inputBinding.createMany({ data: muBindings })

  console.log(`✅ 4 state machines (Digital Thread Lifecycle + Aerostructure R&I + Manual Handoff Demo + UC Manual-Upload Test)`)
  console.log(`   sm-uc-manual-upload: ${muTaskNodes.length} task + ${muGateNodes.length} gateway nodes, ${muEdges.length} edges, ${muBindings.length} FROM_NODE bindings`)

  // ── Demo Iterations ───────────────────────────────────────────────────────

  // V1: FAILED iteration
  await prisma.iteration.upsert({
    where: { id: 'V1' },
    update: { ownerPartnerId: 'p-cai', productId: 'prod-wing-panel' },
    create: {
      id: 'V1',
      displayId: 'V1',
      machineId: 'sm-lifecycle',
      machineName: 'Digital Thread Lifecycle',
      status: 'FAILED',
      ownerPartnerId: 'p-cai',
      productId: 'prod-wing-panel',
      metadataJson: JSON.stringify({ partNumber: 'COMP-PANEL-001', material: 'PEEK-CF-T300', componentRef: 'urn:digital-thread:component:wing-panel-42' }),
      createdAt: new Date('2026-02-01T08:00:00Z'),
      completedAt: new Date('2026-02-05T16:00:00Z'),
    },
  })

  const v1NodeStates = [
    { nodeId: 'lc-cad', status: 'COMPLETED', startedAt: new Date('2026-02-01T08:00:00Z'), completedAt: new Date('2026-02-01T08:30:00Z'), logsJson: JSON.stringify(['[08:30:00] CAD file uploaded: composite_panel_v3.step']), outputFilePath: 'cad-releases/V1/CAI/composite_panel_v3.step', claimedBy: 'CAI' },
    { nodeId: 'lc-mat', status: 'COMPLETED', startedAt: new Date('2026-02-01T12:00:00Z'), completedAt: new Date('2026-02-01T14:00:00Z'), logsJson: JSON.stringify(['[14:00:00] Material card uploaded: PEEK-CF-T300']), outputFilePath: 'material-specs/V1/AIMPLAS/material_card.json', claimedBy: 'AIMPLAS' },
    { nodeId: 'lc-sim', status: 'COMPLETED', startedAt: new Date('2026-02-02T09:00:00Z'), completedAt: new Date('2026-02-02T09:15:00Z'), logsJson: JSON.stringify(['[09:00:00] Simulation started', '[09:10:00] Mesh processed (1.2M elements)', '[09:15:00] Complete — Tg: 343C']), outputFilePath: 'sim-results/V1/ENS/consolidation_report.pdf' },
    { nodeId: 'lc-mfg', status: 'COMPLETED', startedAt: new Date('2026-02-03T08:00:00Z'), completedAt: new Date('2026-02-03T11:00:00Z'), logsJson: JSON.stringify(['[11:00:00] Process logs uploaded (1847 plies)']), outputFilePath: 'mfg-logs/V1/AIM/process_logs.parquet', claimedBy: 'AIM / MSQ' },
    { nodeId: 'lc-ndi', status: 'COMPLETED', startedAt: new Date('2026-02-04T09:00:00Z'), completedAt: new Date('2026-02-04T10:30:00Z'), logsJson: JSON.stringify(['[10:30:00] C-scan data uploaded (256 MB)']), outputFilePath: 'ndi-results/V1/IMD/ultrasound_scan.raw', claimedBy: 'IMD / IDK' },
    { nodeId: 'lc-ai', status: 'ERROR', startedAt: new Date('2026-02-05T13:00:00Z'), completedAt: new Date('2026-02-05T14:00:00Z'), logsJson: JSON.stringify(['[13:00:00] AI model loaded (YOLOv8-Composite)', '[13:30:00] Processing scan tiles...', '[14:00:00] CRITICAL: Delamination at ply 23-25, zone B3']), outputFilePath: 'ai-results/V1/IMD/defect_map.json', errorMessage: 'Delamination detected — porosity 2.1% exceeds 1.5% threshold' },
    { nodeId: 'lc-shm', status: 'IDLE', logsJson: '[]' },
    { nodeId: 'lc-repair', status: 'IDLE', logsJson: '[]' },
    { nodeId: 'lc-delam', status: 'IDLE', logsJson: '[]' },
    { nodeId: 'lc-recycle', status: 'IDLE', logsJson: '[]' },
  ]

  for (const ns of v1NodeStates) {
    await prisma.nodeRuntimeState.upsert({
      where: { iterationId_nodeId: { iterationId: 'V1', nodeId: ns.nodeId } },
      update: {},
      create: { iterationId: 'V1', ...ns },
    })
  }

  const v1Timeline = [
    { id: 'te-v1-1', timestamp: new Date('2026-02-01T08:30:00Z'), nodeId: 'lc-cad', nodeLabel: 'CAD Release', partner: 'CAI', action: 'File Uploaded', detail: 'composite_panel_v3.step uploaded' },
    { id: 'te-v1-2', timestamp: new Date('2026-02-01T14:00:00Z'), nodeId: 'lc-mat', nodeLabel: 'Material Specification', partner: 'AIMPLAS', action: 'File Uploaded', detail: 'PEEK-CF-T300 material card submitted' },
    { id: 'te-v1-3', timestamp: new Date('2026-02-02T09:15:00Z'), nodeId: 'lc-sim', nodeLabel: 'Process Simulation', partner: 'ENS', action: 'Auto Completed', detail: 'Consolidation simulation passed — Tg: 343C, pressure: 10 bar' },
    { id: 'te-v1-4', timestamp: new Date('2026-02-03T11:00:00Z'), nodeId: 'lc-mfg', nodeLabel: 'ATL Manufacturing', partner: 'AIM / MSQ', action: 'File Uploaded', detail: 'ATL process logs (1847 plies) uploaded' },
    { id: 'te-v1-5', timestamp: new Date('2026-02-04T10:30:00Z'), nodeId: 'lc-ndi', nodeLabel: 'NDI Inspection', partner: 'IMD / IDK', action: 'File Uploaded', detail: 'C-scan raw data (256 MB) uploaded' },
    { id: 'te-v1-6', timestamp: new Date('2026-02-05T14:00:00Z'), nodeId: 'lc-ai', nodeLabel: 'AI Defect Detection', partner: 'IMD', action: 'Defect Found', detail: 'CRITICAL: Delamination detected at ply 23-25, zone B3. Porosity 2.1% — exceeds 1.5% threshold' },
  ]

  for (const ev of v1Timeline) {
    await prisma.timelineEvent.upsert({ where: { id: ev.id }, update: {}, create: { iterationId: 'V1', ...ev } })
  }

  // V2-MaterialUpdate: RUNNING iteration
  await prisma.iteration.upsert({
    where: { id: 'V2-MaterialUpdate' },
    update: { ownerPartnerId: 'p-cai', productId: 'prod-wing-panel' },
    create: {
      id: 'V2-MaterialUpdate',
      displayId: 'V2-MaterialUpdate',
      machineId: 'sm-lifecycle',
      machineName: 'Digital Thread Lifecycle',
      status: 'RUNNING',
      ownerPartnerId: 'p-cai',
      productId: 'prod-wing-panel',
      metadataJson: JSON.stringify({ partNumber: 'COMP-PANEL-001', material: 'PEEK-CF-T700 (Updated)', componentRef: 'urn:digital-thread:component:wing-panel-42' }),
      parentIterationId: 'V1',
      restartFromNodeId: 'lc-mat',
      createdAt: new Date('2026-02-06T09:00:00Z'),
    },
  })

  const v2NodeStates = [
    { nodeId: 'lc-cad', status: 'COMPLETED', startedAt: new Date('2026-02-01T08:00:00Z'), completedAt: new Date('2026-02-01T08:30:00Z'), logsJson: JSON.stringify(['[08:30:00] Inherited from V1: composite_panel_v3.step']), outputFilePath: 'cad-releases/V1/CAI/composite_panel_v3.step' },
    { nodeId: 'lc-mat', status: 'COMPLETED', startedAt: new Date('2026-02-06T09:00:00Z'), completedAt: new Date('2026-02-06T10:30:00Z'), logsJson: JSON.stringify(['[09:00:00] Material update initiated', '[10:30:00] New material card: PEEK-CF-T700']), outputFilePath: 'material-specs/V2-MaterialUpdate/AIMPLAS/material_card.json', claimedBy: 'AIMPLAS' },
    { nodeId: 'lc-sim', status: 'COMPLETED', startedAt: new Date('2026-02-06T11:00:00Z'), completedAt: new Date('2026-02-06T11:45:00Z'), logsJson: JSON.stringify(['[11:00:00] Re-simulation started with T700 params', '[11:45:00] Complete — improved consolidation']), outputFilePath: 'sim-results/V2-MaterialUpdate/ENS/consolidation_report.pdf' },
    { nodeId: 'lc-mfg', status: 'PENDING', logsJson: JSON.stringify(['Waiting for AIM / MSQ to claim and upload new process logs']) },
    { nodeId: 'lc-ndi', status: 'IDLE', logsJson: '[]' },
    { nodeId: 'lc-ai', status: 'IDLE', logsJson: '[]' },
    { nodeId: 'lc-shm', status: 'IDLE', logsJson: '[]' },
    { nodeId: 'lc-repair', status: 'IDLE', logsJson: '[]' },
    { nodeId: 'lc-delam', status: 'IDLE', logsJson: '[]' },
    { nodeId: 'lc-recycle', status: 'IDLE', logsJson: '[]' },
  ]

  for (const ns of v2NodeStates) {
    await prisma.nodeRuntimeState.upsert({
      where: { iterationId_nodeId: { iterationId: 'V2-MaterialUpdate', nodeId: ns.nodeId } },
      update: {},
      create: { iterationId: 'V2-MaterialUpdate', ...ns },
    })
  }

  const v2Timeline = [
    { id: 'te-v2-1', timestamp: new Date('2026-02-06T09:00:00Z'), nodeId: 'lc-mat', nodeLabel: 'Material Specification', partner: 'AIMPLAS', action: 'Iteration Restarted', detail: 'New iteration from V1 — material updated to PEEK-CF-T700 to improve adhesion' },
    { id: 'te-v2-2', timestamp: new Date('2026-02-06T10:30:00Z'), nodeId: 'lc-mat', nodeLabel: 'Material Specification', partner: 'AIMPLAS', action: 'File Uploaded', detail: 'Updated material card: PEEK-CF-T700 with improved resin flow' },
    { id: 'te-v2-3', timestamp: new Date('2026-02-06T11:45:00Z'), nodeId: 'lc-sim', nodeLabel: 'Process Simulation', partner: 'ENS', action: 'Auto Completed', detail: 'Re-simulation with T700 — improved consolidation predicted' },
  ]

  for (const ev of v2Timeline) {
    await prisma.timelineEvent.upsert({ where: { id: ev.id }, update: {}, create: { iterationId: 'V2-MaterialUpdate', ...ev } })
  }

  console.log(`✅ 2 demo iterations (V1 FAILED, V2-MaterialUpdate RUNNING) with node states and timeline`)

  // ── Demo Files + Lineage + Enrichment ─────────────────────────────────────
  // The two demo iterations above carry only NodeRuntimeState + TimelineEvent.
  // To exercise the traceability pages (Explorer, Lineage, Enrichment,
  // Provenance) out of the box, we materialise the FileRecord rows for the
  // completed nodes plus the lineage edges and enrichment records that the
  // running platform would otherwise derive at node-completion / file_saved.

  const sha = (s: string) => 'sha256:' + createHash('sha256').update(s).digest('hex')

  const demoFiles = [
    // V1 — full lifecycle chain: CAD → Material → Simulation → Manufacturing → NDI → AI
    { id: 'f-v1-cad',   iterationId: 'V1', nodeSourceId: 'lc-cad', nodeSourceLabel: 'CAD Release',            filename: 'composite_panel_v3.step',  uploadType: 'MANUAL',    contentType: 'application/octet-stream', sourceInfo: 'uploaded by operator@cai.eu',                  sizeBytes: 4_718_592,   classification: 'PARTNER',      timestamp: new Date('2026-02-01T08:30:00Z') },
    { id: 'f-v1-mat',   iterationId: 'V1', nodeSourceId: 'lc-mat', nodeSourceLabel: 'Material Specification', filename: 'material_card.json',       uploadType: 'MANUAL',    contentType: 'application/json',         sourceInfo: 'uploaded by operator@aimplas.eu',              sizeBytes: 12_044,      classification: 'INTERNAL',     timestamp: new Date('2026-02-01T14:00:00Z') },
    { id: 'f-v1-sim',   iterationId: 'V1', nodeSourceId: 'lc-sim', nodeSourceLabel: 'Process Simulation',     filename: 'consolidation_report.pdf', uploadType: 'AUTOMATIC', contentType: 'application/pdf',          sourceInfo: 'generated by ProcessSimHandler v1.2.0',        sizeBytes: 2_310_144,   classification: 'INTERNAL',     timestamp: new Date('2026-02-02T09:15:00Z') },
    { id: 'f-v1-mfg',   iterationId: 'V1', nodeSourceId: 'lc-mfg', nodeSourceLabel: 'ATL Manufacturing',      filename: 'process_logs.parquet',     uploadType: 'MANUAL',    contentType: 'application/octet-stream', sourceInfo: 'uploaded by operator@aim.eu',                  sizeBytes: 33_554_432,  classification: 'INTERNAL',     timestamp: new Date('2026-02-03T11:00:00Z') },
    { id: 'f-v1-ndi',   iterationId: 'V1', nodeSourceId: 'lc-ndi', nodeSourceLabel: 'NDI Inspection',         filename: 'ultrasound_scan.raw',      uploadType: 'MANUAL',    contentType: 'application/octet-stream', sourceInfo: 'uploaded by operator@imd.eu',                  sizeBytes: 268_435_456, classification: 'INTERNAL',     timestamp: new Date('2026-02-04T10:30:00Z') },
    { id: 'f-v1-aimap', iterationId: 'V1', nodeSourceId: 'lc-ai',  nodeSourceLabel: 'AI Defect Detection',    filename: 'defect_map.json',          uploadType: 'AUTOMATIC', contentType: 'application/json',         sourceInfo: 'generated by AiDefectDetectionHandler v2.1.0', sizeBytes: 48_210,      classification: 'CONFIDENTIAL', timestamp: new Date('2026-02-05T14:00:00Z') },
    { id: 'f-v1-aipng', iterationId: 'V1', nodeSourceId: 'lc-ai',  nodeSourceLabel: 'AI Defect Detection',    filename: 'defect_overlay.png',       uploadType: 'AUTOMATIC', contentType: 'image/png',                sourceInfo: 'generated by AiDefectDetectionHandler v2.1.0', sizeBytes: 184_320,     classification: 'CONFIDENTIAL', timestamp: new Date('2026-02-05T14:00:00Z') },
    // V2-MaterialUpdate — material re-run reusing V1's released CAD
    { id: 'f-v2-mat',   iterationId: 'V2-MaterialUpdate', nodeSourceId: 'lc-mat', nodeSourceLabel: 'Material Specification', filename: 'material_card.json',       uploadType: 'MANUAL',    contentType: 'application/json', sourceInfo: 'uploaded by operator@aimplas.eu',       sizeBytes: 12_910,    classification: 'INTERNAL', timestamp: new Date('2026-02-06T10:30:00Z') },
    { id: 'f-v2-sim',   iterationId: 'V2-MaterialUpdate', nodeSourceId: 'lc-sim', nodeSourceLabel: 'Process Simulation',     filename: 'consolidation_report.pdf', uploadType: 'AUTOMATIC', contentType: 'application/pdf',  sourceInfo: 'generated by ProcessSimHandler v1.2.0', sizeBytes: 2_402_304, classification: 'INTERNAL', timestamp: new Date('2026-02-06T11:45:00Z') },
  ]

  // Storage location for the 9 demo files, computed with the exact same
  // scheme FsStorageProvider.save() uses for a 'nodes' upload — basePath +
  // bucket + iterationId + 'nodes' + nodeId + outputId + 'v{version}' +
  // filename — so FileRecord.path resolves and downloads correctly through
  // the running app when STORAGE_PROVIDER=fs. Legacy files with no explicit
  // output slot use the 'default' output-id segment (nodeOutputId stays null
  // on the record, matching how the provider falls back at read time).
  const storageBase = nodePath.resolve(process.env.STORAGE_PATH ?? './storage')
  const storageBucket = process.env.STORAGE_BUCKET ?? 'digital-thread'

  for (const f of demoFiles) {
    const abs = nodePath.join(storageBase, storageBucket, f.iterationId, 'nodes', f.nodeSourceId, 'default', 'v1', f.filename)
    const data = {
      id: f.id, path: abs, bucket: storageBucket, filename: f.filename, version: 1,
      contentHash: sha(abs), timestamp: f.timestamp,
      nodeSourceId: f.nodeSourceId, nodeSourceLabel: f.nodeSourceLabel, iterationId: f.iterationId,
      uploadType: f.uploadType, sourceInfo: f.sourceInfo, sizeBytes: f.sizeBytes,
      contentType: f.contentType, classification: f.classification, pathKind: 'nodes',
    }
    await prisma.fileRecord.upsert({ where: { id: f.id }, update: data, create: data })
    // Write placeholder bytes at the resolved absolute path (idempotent —
    // never overwrites an existing file) so the demo download/lineage/
    // enrichment flows work end-to-end against a real fs storage backend.
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(nodePath.dirname(abs), { recursive: true })
      fs.writeFileSync(
        abs,
        `CompSTLar Digital Thread — seeded demo placeholder\r\nFilename: ${f.filename}\r\nFileRecord: ${f.id}\r\nClassification: ${f.classification}\r\n`,
      )
    }
  }
  console.log(`✅ ${demoFiles.length} demo file records (7 on V1, 2 on V2) + placeholder bytes on disk under ${storageBase}\\${storageBucket}`)

  // Lineage edges — WAS_DERIVED_FROM, mirroring the chain a workflow run would build.
  const demoEdges = [
    { id: 'le-v1-1', up: 'f-v1-cad', down: 'f-v1-sim',   handler: 'ProcessSimHandler',         version: '1.2.0' },
    { id: 'le-v1-2', up: 'f-v1-mat', down: 'f-v1-sim',   handler: 'ProcessSimHandler',         version: '1.2.0' },
    { id: 'le-v1-3', up: 'f-v1-sim', down: 'f-v1-mfg',   handler: null,                        version: null },
    { id: 'le-v1-4', up: 'f-v1-mfg', down: 'f-v1-ndi',   handler: null,                        version: null },
    { id: 'le-v1-5', up: 'f-v1-ndi', down: 'f-v1-aimap', handler: 'AiDefectDetectionHandler',  version: '2.1.0' },
    { id: 'le-v1-6', up: 'f-v1-ndi', down: 'f-v1-aipng', handler: 'AiDefectDetectionHandler',  version: '2.1.0' },
    // cross-iteration: V2 reused V1's released CAD as the simulation input
    { id: 'le-v2-1', up: 'f-v1-cad', down: 'f-v2-sim',   handler: 'ProcessSimHandler',         version: '1.2.0' },
    { id: 'le-v2-2', up: 'f-v2-mat', down: 'f-v2-sim',   handler: 'ProcessSimHandler',         version: '1.2.0' },
  ]

  for (const e of demoEdges) {
    const data = {
      id: e.id, upstreamFileId: e.up, downstreamFileId: e.down, relationType: 'WAS_DERIVED_FROM',
      transformInfo: e.handler ? JSON.stringify({ handlerName: e.handler, handlerVersion: e.version }) : null,
    }
    // LineageEdge is APPEND-ONLY (SQLite trigger blocks UPDATE) — never upsert.
    // Find-then-create keeps the seed idempotent across re-runs.
    const exists = await prisma.lineageEdge.findUnique({ where: { id: e.id } })
    if (!exists) await prisma.lineageEdge.create({ data })
  }
  console.log(`✅ ${demoEdges.length} demo lineage edges (incl. 1 cross-iteration V1→V2)`)

  // Enrichment records — what the enrichers would emit on file_saved.
  const demoEnrichments = [
    {
      id: 'enr-v1-sim-pdf', fileId: 'f-v1-sim', enricherId: 'pdf-text-extractor', enricherVersion: '1.0.0', status: 'OK',
      resultJson: JSON.stringify({
        text: 'Consolidation Process Simulation Report — thermoplastic composite panel. Predicted degree of consolidation 0.98 at 343C under a 10 bar autoclave cure cycle. Material PEEK reinforced with AS4 carbon fibre. Coupon characterisation per ASTM D3039 and ISO 527; quality system AS9100D.',
        textLength: 1840, pageCount: 12,
        materials: ['PEEK', 'AS4/3501-6'],
        standards: ['AS9100D', 'ASTM D3039', 'ISO 527'],
      }),
      createdAt: new Date('2026-02-02T09:16:30Z'),
    },
    {
      id: 'enr-v1-ndi-cscan', fileId: 'f-v1-ndi', enricherId: 'cscan-header-extractor', enricherVersion: '1.0.0', status: 'OK',
      resultJson: JSON.stringify({
        filename: 'ultrasound_scan.raw',
        detectedKeys: ['SCAN_TYPE', 'RESOLUTION_MM', 'PROBE_FREQ_MHZ', 'GAIN_DB', 'GATE_START_US'],
        header: { SCAN_TYPE: 'C-SCAN', RESOLUTION_MM: '0.5', PROBE_FREQ_MHZ: '5.0', GAIN_DB: '42', GATE_START_US: '12.4' },
        sizeBytes: 268_435_456,
      }),
      createdAt: new Date('2026-02-04T10:31:10Z'),
    },
    {
      id: 'enr-v1-aipng-preview', fileId: 'f-v1-aipng', enricherId: 'preview-generator', enricherVersion: '1.0.0', status: 'OK',
      resultJson: JSON.stringify({
        filename: 'defect_overlay.png', contentType: 'image/png', sizeBytes: 184_320,
        thumbnailAvailable: false, dimensions: { width: 1024, height: 768 },
      }),
      createdAt: new Date('2026-02-05T14:00:30Z'),
    },
    {
      id: 'enr-v2-sim-pdf', fileId: 'f-v2-sim', enricherId: 'pdf-text-extractor', enricherVersion: '1.0.0', status: 'OK',
      resultJson: JSON.stringify({
        text: 'Consolidation Process Simulation Report (re-run, material update). Predicted degree of consolidation 0.99 with PEEK-CF-T700 — improved resin flow over the T300 baseline. Quality system AS9100D.',
        textLength: 1520, pageCount: 11,
        materials: ['PEEK'],
        standards: ['AS9100D'],
      }),
      createdAt: new Date('2026-02-06T11:46:00Z'),
    },
  ]

  for (const en of demoEnrichments) {
    await prisma.enrichmentRecord.upsert({ where: { id: en.id }, update: en, create: en })
  }
  console.log(`✅ ${demoEnrichments.length} demo enrichment records (pdf-text, cscan-header, preview)`)

  console.log('\n🎉 Seed complete!')
  console.log('   Login: admin@compstlar.eu / admin123')
  console.log('   GET /api/v1/machines → 4 state machines')
  console.log('   GET /api/v1/iterations → V1 (FAILED) + V2-MaterialUpdate (RUNNING)')
  console.log('   GET /api/v1/files → 9 files with lineage + enrichment (File Explorer → Trace)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
