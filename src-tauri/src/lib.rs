use base64::{engine::general_purpose, Engine as _};
use chrono::Local;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;
use uuid::Uuid;

// ═══════════════════════════════════════════════════
//   APP STATE
// ═══════════════════════════════════════════════════

struct AppState {
    mp4_sessions: Mutex<HashMap<String, PathBuf>>,
}

// ═══════════════════════════════════════════════════
//   DIRECTORY HELPERS
// ═══════════════════════════════════════════════════

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("failed to resolve app data dir")
}

fn brush_dir(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("brush")
}

fn audio_dir(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("audio")
}

fn projects_dir(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("projects")
}

fn exports_dir(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("exports")
}

fn ensure_dirs(app: &tauri::AppHandle) {
    for dir in [
        data_dir(app),
        brush_dir(app),
        audio_dir(app),
        projects_dir(app),
        exports_dir(app),
    ] {
        fs::create_dir_all(&dir).ok();
    }
}

const ALLOWED_AUDIO_EXT: &[&str] = &[
    ".wav", ".mp3", ".ogg", ".flac", ".aac", ".m4a", ".webm",
];

fn is_audio_ext(ext: &str) -> bool {
    ALLOWED_AUDIO_EXT.contains(&ext.to_lowercase().as_str())
}

// ═══════════════════════════════════════════════════
//   BRUSH COMMANDS
// ═══════════════════════════════════════════════════

#[tauri::command]
fn list_brushes(app: tauri::AppHandle) -> Vec<String> {
    let dir = brush_dir(&app);
    let mut files: Vec<String> = fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name.to_lowercase().ends_with(".png") {
                Some(name)
            } else {
                None
            }
        })
        .collect();
    files.sort();
    files
}

/// Returns the brush PNG as a base64-encoded string.
#[tauri::command]
fn get_brush_data(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    let path = brush_dir(&app).join(&filename);
    let data = fs::read(&path).map_err(|e| format!("Failed to read brush: {e}"))?;
    Ok(general_purpose::STANDARD.encode(&data))
}

// ═══════════════════════════════════════════════════
//   AUDIO COMMANDS
// ═══════════════════════════════════════════════════

#[derive(Serialize)]
struct AudioInfo {
    filename: Option<String>,
    data: Option<String>, // base64
}

/// Save audio data (base64) to the audio directory, replacing any existing track.
#[tauri::command]
fn save_audio(
    app: tauri::AppHandle,
    data: String,
    filename: String,
) -> Result<String, String> {
    let dir = audio_dir(&app);

    // Validate extension
    let ext = filename
        .rfind('.')
        .map(|i| &filename[i..])
        .unwrap_or("");
    if !is_audio_ext(ext) {
        return Err(format!("Unsupported audio format: {ext}"));
    }

    // Clear existing audio files
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                fs::remove_file(entry.path()).ok();
            }
        }
    }

    let safe_name = format!("track{ext}");
    let path = dir.join(&safe_name);
    let bytes = general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Failed to decode audio data: {e}"))?;
    fs::write(&path, &bytes).map_err(|e| format!("Failed to write audio: {e}"))?;

    Ok(safe_name)
}

/// Returns info about the current audio file, including its data as base64.
#[tauri::command]
fn get_current_audio(app: tauri::AppHandle) -> Result<AudioInfo, String> {
    let dir = audio_dir(&app);
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }
            let ext = path.extension()
                .and_then(|x| x.to_str())
                .map(|x| format!(".{x}"))
                .unwrap_or_default();
            if is_audio_ext(&ext) {
                let name = entry.file_name().to_string_lossy().to_string();
                let bytes = fs::read(&path)
                    .map_err(|e| format!("Failed to read audio: {e}"))?;
                return Ok(AudioInfo {
                    filename: Some(name),
                    data: Some(general_purpose::STANDARD.encode(&bytes)),
                });
            }
        }
    }
    Ok(AudioInfo {
        filename: None,
        data: None,
    })
}

/// Remove all audio files.
#[tauri::command]
fn remove_audio(app: tauri::AppHandle) -> Result<u32, String> {
    let dir = audio_dir(&app);
    let mut removed = 0u32;
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                fs::remove_file(entry.path()).ok();
                removed += 1;
            }
        }
    }
    Ok(removed)
}

// ═══════════════════════════════════════════════════
//   PNG EXPORT
// ═══════════════════════════════════════════════════

/// Decode a base64 PNG and write it to the given path (from a save dialog).
#[tauri::command]
fn export_png(image: String, path: String) -> Result<(), String> {
    let image_data = if let Some(pos) = image.find(',') {
        &image[pos + 1..]
    } else {
        &image
    };
    let bytes = general_purpose::STANDARD
        .decode(image_data)
        .map_err(|e| format!("Failed to decode image: {e}"))?;
    fs::write(&path, &bytes).map_err(|e| format!("Failed to write PNG: {e}"))?;
    Ok(())
}

// ═══════════════════════════════════════════════════
//   PROJECT I/O
// ═══════════════════════════════════════════════════

#[derive(Serialize)]
struct ProjectInfo {
    filename: String,
    modified: f64,
}

#[tauri::command]
fn save_project(
    app: tauri::AppHandle,
    state: serde_json::Value,
    name: Option<String>,
    is_autosave: bool,
) -> Result<String, String> {
    let dir = projects_dir(&app);
    let filename = if is_autosave {
        "autosave.json".to_string()
    } else {
        let n = name.unwrap_or_else(|| "untitled".to_string());
        let ts = Local::now().format("%Y%m%d_%H%M%S");
        format!("{n}_{ts}.json")
    };
    let path = dir.join(&filename);
    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Serialization error: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Write error: {e}"))?;
    Ok(filename)
}

#[tauri::command]
fn load_project(
    app: tauri::AppHandle,
    filename: String,
) -> Result<serde_json::Value, String> {
    let path = projects_dir(&app).join(&filename);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    let contents = fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))?;
    let data: serde_json::Value =
        serde_json::from_str(&contents).map_err(|e| format!("Parse error: {e}"))?;
    Ok(data)
}

#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<ProjectInfo>, String> {
    let dir = projects_dir(&app);
    let mut files: Vec<ProjectInfo> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") {
                if let Ok(meta) = entry.metadata() {
                    let modified = meta
                        .modified()
                        .map(|t| {
                            t.duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs_f64()
                        })
                        .unwrap_or(0.0);
                    files.push(ProjectInfo {
                        filename: name,
                        modified,
                    });
                }
            }
        }
    }
    files.sort_by(|a, b| b.modified.partial_cmp(&a.modified).unwrap());
    Ok(files)
}

// ═══════════════════════════════════════════════════
//   MP4 EXPORT
// ═══════════════════════════════════════════════════

/// Create a temporary directory for frame images.
#[tauri::command]
fn mp4_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string()[..12].to_string();
    let session_dir = exports_dir(&app).join(format!("mp4_{session_id}"));
    fs::create_dir_all(&session_dir).map_err(|e| format!("Failed to create session dir: {e}"))?;
    state
        .mp4_sessions
        .lock()
        .unwrap()
        .insert(session_id.clone(), session_dir);
    Ok(session_id)
}

/// Receive a single frame PNG (base64) and write it to the session dir.
#[tauri::command]
fn mp4_frame(
    state: tauri::State<'_, AppState>,
    session_id: String,
    frame_index: u32,
    image: String,
) -> Result<(), String> {
    let sessions = state.mp4_sessions.lock().unwrap();
    let session_dir = sessions
        .get(&session_id)
        .ok_or("Invalid or expired session")?;

    let image_data = if let Some(pos) = image.find(',') {
        &image[pos + 1..]
    } else {
        &image
    };
    let bytes = general_purpose::STANDARD
        .decode(image_data)
        .map_err(|e| format!("Decode error: {e}"))?;

    let frame_path = session_dir.join(format!("frame_{frame_index:04}.png"));
    fs::write(&frame_path, &bytes).map_err(|e| format!("Write error: {e}"))?;
    Ok(())
}

/// Encode frames into an MP4 via FFmpeg, writing to `output_path`.
#[tauri::command]
fn mp4_render(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_id: String,
    fps: u32,
    include_audio: bool,
    total_frames: u32,
    output_path: String,
) -> Result<(), String> {
    let session_dir = {
        let sessions = state.mp4_sessions.lock().unwrap();
        sessions
            .get(&session_id)
            .cloned()
            .ok_or("Invalid or expired session")?
    };

    let fps = fps.max(1);
    let video_duration = total_frames as f64 / fps as f64;

    // Find audio file if requested
    let audio_file = if include_audio {
        let dir = audio_dir(&app);
        fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .find(|e| {
                let path = e.path();
                if !path.is_file() { return false; }
                let ext = path.extension()
                    .and_then(|x| x.to_str())
                    .map(|x| format!(".{x}"))
                    .unwrap_or_default();
                is_audio_ext(&ext)
            })
            .map(|e| e.path())
    } else {
        None
    };

    // Build FFmpeg command
    let input_pattern = session_dir.join("frame_%04d.png");
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-framerate", &fps.to_string()]);
    cmd.args(["-i", &input_pattern.to_string_lossy()]);

    if let Some(ref audio) = audio_file {
        cmd.args(["-i", &audio.to_string_lossy()]);
    }

    cmd.args([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "18",
        "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    ]);

    if audio_file.is_some() {
        cmd.args(["-c:a", "aac", "-b:a", "192k", "-shortest"]);
    }

    cmd.args(["-t", &format!("{video_duration:.4}")]);
    cmd.arg(&output_path);

    let output = cmd
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "FFmpeg not found. Please install FFmpeg and ensure it is on your PATH.".to_string()
            } else {
                format!("Failed to run FFmpeg: {e}")
            }
        })?;

    // Clean up session
    cleanup_session(&state.mp4_sessions, &session_id);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr.chars().rev().take(1500).collect::<String>().chars().rev().collect();
        return Err(format!("FFmpeg encoding failed:\n{tail}"));
    }

    Ok(())
}

fn cleanup_session(sessions: &Mutex<HashMap<String, PathBuf>>, session_id: &str) {
    if let Some(dir) = sessions.lock().unwrap().remove(session_id) {
        fs::remove_dir_all(&dir).ok();
    }
}

// ═══════════════════════════════════════════════════
//   UTILITY
// ═══════════════════════════════════════════════════

/// Returns the app data directory path so the user knows where brushes go.
#[tauri::command]
fn get_data_dir(app: tauri::AppHandle) -> String {
    data_dir(&app).to_string_lossy().to_string()
}

// ═══════════════════════════════════════════════════
//   ENTRY POINT
// ═══════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            mp4_sessions: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            list_brushes,
            get_brush_data,
            save_audio,
            get_current_audio,
            remove_audio,
            export_png,
            save_project,
            load_project,
            list_projects,
            mp4_start,
            mp4_frame,
            mp4_render,
            get_data_dir,
        ])
        .setup(|app| {
            ensure_dirs(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running VectorFrame");
}
