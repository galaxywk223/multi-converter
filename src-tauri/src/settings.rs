use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub output_dir: String,
    pub model_id: String,
    pub model_path: Option<String>,
    pub language: String,
    pub device_preference: String,
    pub ffmpeg_path: Option<String>,
    pub temp_policy: String,
    pub concurrency: u8,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            output_dir: String::new(),
            model_id: "medium".to_string(),
            model_path: None,
            language: "zh".to_string(),
            device_preference: "auto".to_string(),
            ffmpeg_path: None,
            temp_policy: "cleanup_after_success".to_string(),
            concurrency: 1,
        }
    }
}

#[derive(Clone)]
pub struct SettingsStore {
    file_path: PathBuf,
}

impl SettingsStore {
    pub fn new(file_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let store = Self { file_path };
        if !store.file_path.exists() {
            store.save(&AppSettings::default())?;
        }
        Ok(store)
    }

    pub fn load(&self) -> Result<AppSettings, String> {
        if !self.file_path.exists() {
            let defaults = AppSettings::default();
            self.save(&defaults)?;
            return Ok(defaults);
        }

        let contents = fs::read_to_string(&self.file_path).map_err(|error| error.to_string())?;
        if contents.trim().is_empty() {
            let defaults = AppSettings::default();
            self.save(&defaults)?;
            return Ok(defaults);
        }

        serde_json::from_str(&contents).map_err(|error| error.to_string())
    }

    pub fn save(&self, settings: &AppSettings) -> Result<AppSettings, String> {
        let normalized = normalize_settings(settings.clone());
        let json = serde_json::to_string_pretty(&normalized).map_err(|error| error.to_string())?;
        fs::write(&self.file_path, json).map_err(|error| error.to_string())?;
        Ok(normalized)
    }
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    settings.output_dir = settings.output_dir.trim().to_string();
    settings.model_id = if settings.model_id.trim().is_empty() {
        "medium".to_string()
    } else {
        settings.model_id.trim().to_string()
    };
    settings.model_path = settings.model_path.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    settings.language = if settings.language.trim().is_empty() {
        "zh".to_string()
    } else {
        settings.language.trim().to_string()
    };
    settings.device_preference = match settings.device_preference.as_str() {
        "cpu" | "cuda" => settings.device_preference,
        _ => "auto".to_string(),
    };
    settings.ffmpeg_path = settings.ffmpeg_path.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    settings.temp_policy = match settings.temp_policy.as_str() {
        "keep_all" => "keep_all".to_string(),
        _ => "cleanup_after_success".to_string(),
    };
    settings.concurrency = 1;
    settings
}
