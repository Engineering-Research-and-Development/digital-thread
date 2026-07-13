/**
 * Master Node Type Catalog — 30 nodeTypeIds
 * 20 original (from frontend node-catalog.ts) + 10 new R&I Aerostructure types
 */

export interface NodeCatalogEntry {
  nodeTypeId: string
  category: 'TRIGGER' | 'AUTOMATIC' | 'MANUAL' | 'GATEWAY' | 'STORAGE'
  label: string
  color: string
  icon: string
  description: string
  defaultPartner?: string
  expectedOutput?: string
}

export const NODE_CATALOG: NodeCatalogEntry[] = [
  // === TRIGGER ===
  { nodeTypeId: 'CAD_UPLOAD', category: 'TRIGGER', label: 'CAD Upload', color: '#10B981', icon: 'Upload', description: 'Triggered when a CAD file is uploaded to the watch path', expectedOutput: '.step / .iges / .catpart' },
  { nodeTypeId: 'MATERIAL_CHANGE', category: 'TRIGGER', label: 'Material Change', color: '#10B981', icon: 'Layers', description: 'Triggered when material specification changes', expectedOutput: 'material_spec.json' },

  // === AUTOMATIC ===
  { nodeTypeId: 'SIM_CONSOLIDATION', category: 'AUTOMATIC', label: 'Sim Consolidation', color: '#8B5CF6', icon: 'Cpu', description: 'Thermoplastic consolidation process simulation', defaultPartner: 'ENS', expectedOutput: 'consolidation_report.pdf' },
  { nodeTypeId: 'PROCESS_SIM', category: 'AUTOMATIC', label: 'Process Simulation', color: '#8B5CF6', icon: 'Cpu', description: 'Generic manufacturing process simulation', expectedOutput: 'process_report.pdf' },
  { nodeTypeId: 'AI_QUALITY_CHECK', category: 'AUTOMATIC', label: 'AI Quality Check', color: '#8B5CF6', icon: 'Brain', description: 'AI-powered porosity and defect quality analysis', defaultPartner: 'IMD', expectedOutput: 'quality_report.json' },
  { nodeTypeId: 'AI_DEFECT_DETECTION', category: 'AUTOMATIC', label: 'AI Defect Detection', color: '#8B5CF6', icon: 'Brain', description: 'AI-powered defect detection on NDI scan data (CNN model)', defaultPartner: 'IMD', expectedOutput: 'defect_map.json' },
  { nodeTypeId: 'SHM_CALIBRATION', category: 'AUTOMATIC', label: 'SHM Calibration', color: '#8B5CF6', icon: 'Activity', description: 'Structural Health Monitoring — calibrate digital twin with sensor data', defaultPartner: 'IMD', expectedOutput: 'digital_twin_config.xml' },
  // R&I types
  { nodeTypeId: 'TOPOLOGY_OPTIMIZATION', category: 'AUTOMATIC', label: 'Topology Optimization', color: '#8B5CF6', icon: 'Hexagon', description: 'FEA-driven topology optimization for minimum weight', defaultPartner: 'Simulation Lab', expectedOutput: 'optimized_topology.step' },
  { nodeTypeId: 'FEA_STRUCTURAL', category: 'AUTOMATIC', label: 'FEA Structural Analysis', color: '#8B5CF6', icon: 'Grid', description: 'Finite Element structural analysis (Nastran/Abaqus/CalculiX)', defaultPartner: 'Simulation Lab', expectedOutput: 'fea_results.h5' },
  { nodeTypeId: 'DIC_STRAIN_FIELD', category: 'AUTOMATIC', label: 'DIC Strain Field', color: '#8B5CF6', icon: 'Eye', description: 'Digital Image Correlation — full-field strain measurement', defaultPartner: 'Test Center', expectedOutput: 'strain_field.hdf5' },
  { nodeTypeId: 'VIRTUAL_TESTING', category: 'AUTOMATIC', label: 'Virtual Testing', color: '#8B5CF6', icon: 'Monitor', description: 'Virtual structural test using calibrated digital twin', defaultPartner: 'Simulation Lab', expectedOutput: 'virtual_test_results.json' },
  { nodeTypeId: 'AI_DATA_ANALYSIS', category: 'AUTOMATIC', label: 'AI Data Analysis', color: '#8B5CF6', icon: 'TrendingUp', description: 'ML-based analysis of test data for failure mode identification', defaultPartner: 'Test Center', expectedOutput: 'analysis_report.json' },

  // === MANUAL ===
  { nodeTypeId: 'CAD_RELEASE', category: 'MANUAL', label: 'CAD Release', color: '#3B82F6', icon: 'FileCode2', description: 'Release STEP/CATPART design files', defaultPartner: 'CAI', expectedOutput: '.step / .catpart' },
  { nodeTypeId: 'MATERIAL_SPEC', category: 'MANUAL', label: 'Material Specification', color: '#3B82F6', icon: 'Layers', description: 'Define thermoplastic material card and properties', defaultPartner: 'AIMPLAS', expectedOutput: 'material_card.json' },
  { nodeTypeId: 'ATL_MANUFACTURING', category: 'MANUAL', label: 'ATL Manufacturing', color: '#3B82F6', icon: 'Wrench', description: 'Automated Tape Laying physical deposition process', defaultPartner: 'AIM / MSQ', expectedOutput: 'process_logs.parquet' },
  { nodeTypeId: 'MFG_ATL', category: 'MANUAL', label: 'Manufacturing ATL', color: '#3B82F6', icon: 'Wrench', description: 'ATL manufacturing with process log upload', defaultPartner: 'AIM', expectedOutput: 'atl_logs.csv' },
  { nodeTypeId: 'NDI_SCAN', category: 'MANUAL', label: 'NDI Inspection', color: '#3B82F6', icon: 'ScanSearch', description: 'Non-destructive ultrasound/XCT inspection', defaultPartner: 'IMD / IDK', expectedOutput: 'ultrasound_scan.raw' },
  { nodeTypeId: 'NDI_INSPECTION', category: 'MANUAL', label: 'NDI Inspection Full', color: '#3B82F6', icon: 'ScanSearch', description: 'Full ultrasound C-scan inspection with results upload', defaultPartner: 'IMD', expectedOutput: 'c_scan_results.dicom' },
  { nodeTypeId: 'LAB_TEST', category: 'MANUAL', label: 'Lab Testing', color: '#3B82F6', icon: 'FlaskConical', description: 'Mechanical testing in laboratory (tensile/fatigue/impact)', defaultPartner: 'Materials Lab', expectedOutput: 'lab_report.xlsx' },
  { nodeTypeId: 'REPAIRING', category: 'MANUAL', label: 'Repairing', color: '#3B82F6', icon: 'Hammer', description: 'Composite repair process — design and apply patch', defaultPartner: 'AIM / NTNU / MSQ', expectedOutput: 'patch_design.json' },
  { nodeTypeId: 'DELAMINATION_PROCESS', category: 'MANUAL', label: 'Delamination Process', color: '#3B82F6', icon: 'Scissors', description: 'Controlled delamination for fibre/resin recovery (end-of-life)', defaultPartner: 'AIM / IPT', expectedOutput: 'recovered_material_metadata.json' },
  { nodeTypeId: 'RECYCLING_PLAN', category: 'MANUAL', label: 'Recycling Plan', color: '#3B82F6', icon: 'Recycle', description: 'End-of-life recycling plan and compliance report', defaultPartner: 'AIMPLAS', expectedOutput: 'recycling_report.pdf' },
  // R&I types
  { nodeTypeId: 'REQUIREMENTS_DEF', category: 'MANUAL', label: 'Requirements Definition', color: '#3B82F6', icon: 'ClipboardList', description: 'Define structural, functional and regulatory requirements', defaultPartner: 'Design Authority', expectedOutput: 'requirements_spec.pdf' },
  { nodeTypeId: 'LAB_COUPON_TEST', category: 'MANUAL', label: 'Material Coupon Testing', color: '#3B82F6', icon: 'FlaskConical', description: 'Mechanical tests on material coupons (tension, fatigue, impact)', defaultPartner: 'Materials Lab', expectedOutput: 'coupon_test_report.xlsx' },
  { nodeTypeId: 'PROTOTYPE_MFG', category: 'MANUAL', label: 'Prototype Manufacturing', color: '#3B82F6', icon: 'Box', description: 'Manufacture of research demonstrator/prototype', defaultPartner: 'Manufacturing', expectedOutput: 'manufacturing_report.pdf' },
  { nodeTypeId: 'STRUCTURAL_TEST', category: 'MANUAL', label: 'Structural Testing', color: '#3B82F6', icon: 'Dumbbell', description: 'Full-scale structural test on test bench', defaultPartner: 'Test Center', expectedOutput: 'test_report.pdf' },
  { nodeTypeId: 'TRL_ASSESSMENT', category: 'MANUAL', label: 'TRL Assessment', color: '#3B82F6', icon: 'Award', description: 'Technology Readiness Level evaluation and certification', defaultPartner: 'TRL Review Board', expectedOutput: 'trl_assessment_report.pdf' },

  // === GATEWAY ===
  { nodeTypeId: 'QUALITY_GATE', category: 'GATEWAY', label: 'Quality Gate', color: '#F59E0B', icon: 'GitMerge', description: 'AND/OR/XOR decision gate — evaluates inputs pass/fail' },
  { nodeTypeId: 'VERSION_SYNC', category: 'GATEWAY', label: 'Version Sync', color: '#F59E0B', icon: 'GitMerge', description: 'Synchronise parallel branches before proceeding' },

  // === STORAGE ===
  { nodeTypeId: 'AAS_UPDATE', category: 'STORAGE', label: 'AAS Update', color: '#6B7280', icon: 'Database', description: 'Sync iteration results to Asset Administration Shell server' },
  { nodeTypeId: 'REPORT_GEN', category: 'STORAGE', label: 'Report Generation', color: '#6B7280', icon: 'FileText', description: 'Generate Digital Passport or technical report PDF' },
]
