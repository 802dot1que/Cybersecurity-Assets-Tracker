# Architecture

## Layers

```
 HTTP (FastAPI routers)
       │
 Services (business logic)
       │
 Repositories (SQLAlchemy)
       │
 PostgreSQL
```

Background jobs (ingestion, correlation) run on Redis/RQ workers.

## Domain Model

```
assets ────┬── asset_ips (1-M, IPv4 only)
           ├── asset_security_controls (M-M with control_types)
           ├── asset_conflicts
           ├── asset_criticality (1-1, evolves into M with questionnaire history)
           └── audit_log (polymorphic on entity_type/entity_id)

control_types    # seeded: EDR, AV, SIEM, Patch, DLP, VA, PAM — extensible
ingestion_batches
ingestion_records   # raw row JSON + link to asset created/merged
column_mappings     # saved per-source column profiles
users
```

### Overridable fields (pattern)

For every user-editable asset field:
```
system_<field>           -- last value written by ingestion
override_<field>         -- nullable; set by user
override_<field>_by      -- user id
override_<field>_at      -- timestamp
```
Effective value computed at serialization time: `override ?? system`.

### Control applicability matrix

| Asset Type              | EDR | AV | SIEM | Patch | DLP | VA | PAM |
|-------------------------|:---:|:--:|:----:|:-----:|:---:|:--:|:---:|
| Server / Hypervisor     | ✅  | ✅ | ✅   | ✅    | ✅  | ✅ | ✅  |
| Workstation             | ✅  | ✅ | ✅   | ✅    | ✅  | ✅ | ❌  |
| Router / Switch         | ❌  | ❌ | ✅   | ❌    | ❌  | ❌ | ✅  |
| IP Phone / IP Cam / Printer | ❌ | ❌ | ✅ | ❌    | ❌  | ❌ | ✅  |
| Firewall / Load Balancer | ❌ | ❌ | ✅   | ❌    | ❌  | ❌ | ✅  |
| URL                     | ❌  | ❌ | ❌   | ❌    | ❌  | ❌ | ❌  |

Encoded as `control_types.applies_to_asset_types text[]`. Coverage metrics filter by this matrix so a printer missing EDR is NOT a gap.

## Ingestion Pipeline

```
Upload → persist raw rows → choose/save column map → normalize rows
      → correlate (MAC → hostname → IP) → merge or create asset
      → write system_* fields → record conflicts → audit
```

- Raw rows kept in `ingestion_records.raw` (JSONB) forever.
- Column mappings saved by user as reusable profiles (`column_mappings`).
- Correlation confidence persisted on merge decisions.

## Correlation

Primary: MAC exact.
Fallback: hostname exact → rapidfuzz ratio ≥ 90 → 0.75 confidence.
Tertiary: IP-set intersection ≥ 1 → 0.6 confidence.

When multiple candidates match, pick highest confidence; if tied, raise a conflict instead of silently merging.

## Extensibility Hooks

- `ingestion/connectors/` — drop-in modules (Excel today; NDR, EDR, SIEM later). All implement `Connector.fetch() -> Iterable[RawRecord]`.
- `controls/types` seeded via migration; new controls = insert a row.
- `criticality/scoring.py` — pluggable `Scorer` interface; current impl is rule-based, questionnaire scorer plugs in later.
