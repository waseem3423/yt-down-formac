use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub status: String,   // "downloading" | "merging" | "done" | "error"
    pub message: String,
    pub percent: f32,     // 0.0 - 100.0
}

#[derive(Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    pub quality: String,
    pub output_dir: String,
}

#[tauri::command]
async fn start_download(
    window: tauri::Window,
    request: DownloadRequest,
) -> Result<String, String> {
    let url = request.url.trim().to_string();
    let quality = request.quality.as_str();
    let output_dir = PathBuf::from(&request.output_dir);

    if !url.contains("youtube.com/watch?v=") && !url.contains("youtu.be/") {
        return Err("Invalid YouTube URL".to_string());
    }

    let _ = window.emit("download-progress", DownloadProgress {
        status: "downloading".to_string(),
        message: "Starting...".to_string(),
        percent: 0.0,
    });

    let output_template = output_dir
        .join("%(title)s.%(ext)s")
        .to_string_lossy()
        .to_string();

    let mut args: Vec<String> = vec![url.clone()];

    match quality {
        "audio" => {
            args.extend([
                "-f".to_string(), "bestaudio".to_string(),
                "-x".to_string(),
                "--audio-format".to_string(), "mp3".to_string(),
                "--audio-quality".to_string(), "0".to_string(),
            ]);
        }
        "1080p" => {
            args.extend([
                "-f".to_string(),
                "bestvideo[height<=1080]+bestaudio/best[height<=1080]".to_string(),
                "--merge-output-format".to_string(), "mp4".to_string(),
            ]);
        }
        _ => {
            args.extend([
                "-f".to_string(),
                "bestvideo[height<=720]+bestaudio/best[height<=720]".to_string(),
                "--merge-output-format".to_string(), "mp4".to_string(),
            ]);
        }
    }

    args.extend([
        "--no-playlist".to_string(),
        "--newline".to_string(),
        "-o".to_string(), output_template,
    ]);

    let mut cmd = Command::new("yt-dlp");
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start yt-dlp: {}. Make sure yt-dlp is installed.", e))?;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                let line = line.trim().to_string();
                if line.is_empty() { continue; }

                // Parse percentage from yt-dlp output
                // Example: "[download]  45.3% of 12.34MiB at 1.23MiB/s ETA 00:05"
                let percent = parse_percent(&line);
                let (status, msg) = if line.contains("[Merger]") || line.contains("Merging") {
                    ("merging".to_string(), "Merging audio & video...".to_string())
                } else if line.contains("[ExtractAudio]") || line.contains("Converting") {
                    ("merging".to_string(), "Converting to MP3...".to_string())
                } else if line.contains("[download]") {
                    ("downloading".to_string(), line.clone())
                } else {
                    ("downloading".to_string(), line.clone())
                };

                let _ = window.emit("download-progress", DownloadProgress {
                    status,
                    message: msg,
                    percent: percent.unwrap_or(0.0),
                });
            }
        }
    }

    let output = child.wait_with_output()
        .map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let error_msg = if !stderr.is_empty() { stderr } else { "Download failed".to_string() };
        let _ = window.emit("download-progress", DownloadProgress {
            status: "error".to_string(),
            message: error_msg.clone(),
            percent: 0.0,
        });
        return Err(error_msg);
    }

    let _ = window.emit("download-progress", DownloadProgress {
        status: "done".to_string(),
        message: "Download complete!".to_string(),
        percent: 100.0,
    });

    Ok("Download complete!".to_string())
}

fn parse_percent(line: &str) -> Option<f32> {
    // Match pattern like "45.3%" in yt-dlp output
    if let Some(pos) = line.find('%') {
        let before = &line[..pos];
        let start = before.rfind(|c: char| c == ' ' || c == '\t').map(|i| i + 1).unwrap_or(0);
        let num_str = before[start..].trim();
        if let Ok(val) = num_str.parse::<f32>() {
            return Some(val.min(100.0).max(0.0));
        }
    }
    None
}

#[tauri::command]
async fn get_default_download_dir() -> String {
    if let Some(home) = dirs_next::home_dir() {
        home.join("Downloads").to_string_lossy().to_string()
    } else {
        ".".to_string()
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            start_download,
            get_default_download_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
