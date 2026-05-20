# rc-notes Bruin pipeline

This pipeline mirrors the rc-notes app database (MotherDuck, `rc_notes.main`
schema). It is **not** a generated dataset — the live database is owned by
the Nuxt app (`app/server/utils/db.ts` runs the CREATE TABLE / ALTER
migrations on boot). The role of this pipeline is purely to keep a versioned
schema description of those tables on disk so the catalog stays accurate as
the schema evolves.

## Layout

```
pipeline.yml                       # pipeline-level config (MotherDuck default)
assets/
  main/                            # one .asset.yml per live rc_notes.main table
    workspaces.asset.yml
    tasks.asset.yml
    notes.asset.yml
    diary_entries.asset.yml
    links.asset.yml
    event_log.asset.yml
    users.asset.yml
```

Each `main/*.asset.yml` is `type: empty` — the table is created and owned by
the app, the asset only records the column list + descriptions.

## Connection

`.bruin.yml` (gitignored, project root) holds a single MotherDuck connection
named `motherduck-default`, pointing at the `rc_notes` database. `pipeline.yml`
sets that as the default connection for the `motherduck` type.

```yaml
environments:
  default:
    connections:
      motherduck:
        - name: motherduck-default
          token: <MOTHERDUCK_PAT>
          database: rc_notes
```

The app reads the same token from `app/.env` (`MOTHERDUCK_NOTEBOOK_RC`).

## Common commands

Run from the project root, not from `pipeline/`:

```shell
bruin validate pipeline/                                       # type-check assets
bruin import database --connection motherduck-default pipeline # refresh main/*.asset.yml
```

## Keeping assets in sync with the database

Whenever `app/server/utils/db.ts` adds/drops a column or table:

1. Re-run `bruin import database --connection motherduck-default pipeline`.
2. Delete any junk the importer pulls in from MotherDuck's shared catalogs —
   keep only `assets/main/*.asset.yml` for the seven real rc_notes tables.
   Remove anything under `backup/`, `hn/`, `kaggle/`, `nyc/`,
   `stackoverflow_survey/`, `who/`, and any `main/*.sql` files for MotherDuck
   system views (`database_snapshots`, `databases`, `owned_shares`,
   `query_history`, `recent_queries`, `shared_with_me`, `storage_info*`).
3. Re-add per-column `description:` text on the affected columns (the importer
   strips it).
4. `bruin validate pipeline/` must report "No issues found" before committing.

See the project root [`AGENTS.md`](../AGENTS.md) "Keep pipeline assets in sync
with the database" section for the canonical workflow.
