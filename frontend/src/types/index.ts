export type FieldValue<T = any> = {
  system: T | null;
  override: T | null;
  effective: T | null;
  overridden: boolean;
  overridden_by: number | null;
  overridden_at: string | null;
};

export type AssetIPOut = {
  id: number;
  ip: string;
  is_override: boolean;
  source: string | null;
  first_seen: string | null;
  last_seen: string | null;
};

export type ControlOut = {
  code: string;
  name: string;
  applicable: boolean;
  system_status: string | null;
  override_status: string | null;
  effective_status: string;
  last_check_in: string | null;
  source: string | null;
};

export type ConflictOut = {
  id: number;
  field: string;
  value_a: string | null;
  value_b: string | null;
  source_a: string | null;
  source_b: string | null;
  created_at: string;
};

export type AssetOut = {
  id: number;
  uuid: string;
  hostname: FieldValue<string>;
  mac: FieldValue<string>;
  asset_type: FieldValue<string>;
  os: FieldValue<string>;
  os_version: FieldValue<string>;
  os_eos: FieldValue<string>;
  asset_status: FieldValue<string>;
  environment: FieldValue<string>;
  location: FieldValue<string>;
  function: FieldValue<string>;
  custodian: FieldValue<string>;
  user_name: FieldValue<string>;
  os_license_state: FieldValue<string>;
  edr_license_state: FieldValue<string>;
  av_license_state: FieldValue<string>;
  ips: AssetIPOut[];
  first_seen: string | null;
  last_seen: string | null;
  confidence_score: number;
  controls: ControlOut[];
  criticality: { level: string | null; score: number | null; source: string | null; details: Record<string, any> } | null;
  conflict_count: number;
  conflicts: ConflictOut[];
};

export type AssetListItem = {
  id: number; uuid: string;
  hostname: string | null; mac: string | null;
  asset_type: string | null; os: string | null; os_version: string | null; os_eos: string | null;
  asset_status: string | null; environment: string | null; location: string | null;
  function: string | null; custodian: string | null; user_name: string | null;
  ips: string[]; last_seen: string | null;
  criticality_level: string | null; confidence_score: number;
  conflict_count: number;
};

export type AssetPage = {
  items: AssetListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type VulnerabilityOut = {
  id: number;
  asset_id: number | null;
  plugin_id: number;
  plugin_name: string;
  plugin_family: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  severity_id: number;
  cvss_score: number | null;
  cvss_v3_score: number | null;
  cve_id: string | null;
  description: string | null;
  solution: string | null;
  port: number | null;
  protocol: string | null;
  service: string | null;
  nessus_hostname: string | null;
  nessus_ip: string | null;
  source_scan_id: number;
  first_seen: string;
  last_seen: string;
};

export type VulnPage = {
  items: VulnerabilityOut[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type NessusScanOut = {
  id: number;
  name: string;
  status: string;
  folder_id: number | null;
  last_modification_date: number | null;
  creation_date: number | null;
  type: string | null;
};

export type NessusStatusOut = {
  connected: boolean;
  status: string | null;
  code: string | null;
  error: string | null;
};

export type SyncLogOut = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  scan_id: number | null;
  scans_processed: number;
  assets_matched: number;
  vulns_created: number;
  vulns_updated: number;
  error: string | null;
};

export type AuditEntry = {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  created_at: string;
  extra: Record<string, any>;
  asset_hostname: string | null;
  document_name: string | null;
};
