export type FieldValue<T = any> = {
  system: T | null;
  override: T | null;
  effective: T | null;
  overridden: boolean;
  overridden_by: number | null;
  overridden_at: string | null;
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
  ips: { ip: string; source: string | null; first_seen: string | null; last_seen: string | null }[];
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
