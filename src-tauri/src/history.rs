use std::{fs, path::PathBuf};

use rusqlite::{params, Connection};

use crate::{settings::AppSettings, HistoryRecord, StartJobPayload};

#[derive(Clone)]
pub struct HistoryStore {
    db_path: PathBuf,
}

impl HistoryStore {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let store = Self { db_path };
        store.migrate()?;
        Ok(store)
    }

    pub fn list(&self) -> Result<Vec<HistoryRecord>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT task_id, type, status, created_at, finished_at, inputs_json, output_dir, outputs_json, error, payload_json, settings_snapshot
                 FROM job_history
                 ORDER BY finished_at DESC
                 LIMIT 50",
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([], |row| self.row_to_record(row))
            .map_err(|error| error.to_string())?;

        let mut records = Vec::new();
        for row in rows {
            records.push(row.map_err(|error| error.to_string())?);
        }
        Ok(records)
    }

    pub fn get(&self, task_id: &str) -> Result<Option<HistoryRecord>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT task_id, type, status, created_at, finished_at, inputs_json, output_dir, outputs_json, error, payload_json, settings_snapshot
                 FROM job_history
                 WHERE task_id = ?1
                 LIMIT 1",
            )
            .map_err(|error| error.to_string())?;

        let mut rows = statement
            .query_map([task_id], |row| self.row_to_record(row))
            .map_err(|error| error.to_string())?;

        match rows.next() {
            Some(result) => result.map(Some).map_err(|error| error.to_string()),
            None => Ok(None),
        }
    }

    pub fn upsert(&self, record: &HistoryRecord) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO job_history (
                    task_id,
                    type,
                    status,
                    created_at,
                    finished_at,
                    inputs_json,
                    output_dir,
                    outputs_json,
                    error,
                    payload_json,
                    settings_snapshot
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(task_id) DO UPDATE SET
                    type = excluded.type,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    finished_at = excluded.finished_at,
                    inputs_json = excluded.inputs_json,
                    output_dir = excluded.output_dir,
                    outputs_json = excluded.outputs_json,
                    error = excluded.error,
                    payload_json = excluded.payload_json,
                    settings_snapshot = excluded.settings_snapshot",
                params![
                    record.task_id,
                    record.r#type,
                    record.status,
                    record.created_at,
                    record.finished_at,
                    serde_json::to_string(&record.inputs).map_err(|error| error.to_string())?,
                    record.output_dir,
                    serde_json::to_string(&record.outputs).map_err(|error| error.to_string())?,
                    record.error,
                    serde_json::to_string(&record.payload_json)
                        .map_err(|error| error.to_string())?,
                    serde_json::to_string(&record.settings_snapshot)
                        .map_err(|error| error.to_string())?,
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn migrate(&self) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS job_history (
                    task_id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    finished_at TEXT NOT NULL,
                    inputs_json TEXT NOT NULL,
                    output_dir TEXT NOT NULL,
                    outputs_json TEXT NOT NULL,
                    error TEXT
                );",
            )
            .map_err(|error| error.to_string())?;

        add_column_if_missing(
            &connection,
            "ALTER TABLE job_history ADD COLUMN payload_json TEXT",
        )?;
        add_column_if_missing(
            &connection,
            "ALTER TABLE job_history ADD COLUMN settings_snapshot TEXT",
        )?;
        Ok(())
    }

    fn connection(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path).map_err(|error| error.to_string())
    }

    fn row_to_record(&self, row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryRecord> {
        let inputs_json: String = row.get(5)?;
        let outputs_json: String = row.get(7)?;
        let payload_json: Option<String> = row.get(9)?;
        let settings_snapshot_json: Option<String> = row.get(10)?;

        Ok(HistoryRecord {
            task_id: row.get(0)?,
            r#type: row.get(1)?,
            status: row.get(2)?,
            created_at: row.get(3)?,
            finished_at: row.get(4)?,
            inputs: serde_json::from_str(&inputs_json).unwrap_or_default(),
            output_dir: row.get(6)?,
            outputs: serde_json::from_str(&outputs_json).unwrap_or_default(),
            error: row.get(8)?,
            payload_json: payload_json
                .as_deref()
                .and_then(|value| serde_json::from_str::<StartJobPayload>(value).ok())
                .unwrap_or_default(),
            settings_snapshot: settings_snapshot_json
                .as_deref()
                .and_then(|value| serde_json::from_str::<AppSettings>(value).ok())
                .unwrap_or_default(),
        })
    }
}

fn add_column_if_missing(connection: &Connection, statement: &str) -> Result<(), String> {
    match connection.execute(statement, []) {
        Ok(_) => Ok(()),
        Err(error) => {
            let message = error.to_string();
            if message.contains("duplicate column name") {
                Ok(())
            } else {
                Err(message)
            }
        }
    }
}
