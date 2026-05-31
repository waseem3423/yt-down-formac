use std::process::Command;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub status: String,   // "downloading" | "merging" | "done" | "error"
    pub message: String,
}

#[derive(Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    pub quality: String,  // "720p" | "1080p" | "audio"
    pub output_dir: String,
}

#[tauri::command]
pub async fn start_download(
    window: tauri::Window,
    request: DownloadRequest,
) -> Result<String, String> {
    let url = request.url.trim().to_string();
    let quality = request.quality.as_str();
    let output_dir = PathBuf::from(&request.output_dir);

    // Validate URL
    if !url.contains("youtube.com/watch?v=") && !url.contains("youtu.be/") {
        return Err("Invalid YouTube URL".to_string());
    }

    // Emit progress
    let _ = window.emit("download-progress", DownloadProgress {
        status: "downloading".to_string(),
        message: "Starting download...".to_string(),
    });

    // Build yt-dlp args based on quality
    let output_template = output_dir
        .join("%(title)s.%(ext)s")
        .to_string_lossy()
        .to_string();

    let mut args: Vec<String> = Vec::new();
    args.push(url.clone());

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
            // Default 720p
            args.extend([
                "-f".to_string(),
                "bestvideo[height<=720]+bestaudio/best[height<=720]".to_string(),
                "--merge-output-format".to_string(), "mp4".to_string(),
            ]);
        }
    }

    args.extend([
        "--no-playlist".to_string(),
        "-o".to_string(), output_template,
        "--newline".to_string(),
    ]);

    // Run yt-dlp
    let output = Command::new("yt-dlp")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}. Make sure yt-dlp is installed.", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let error_msg = if !stderr.is_empty() { stderr } else { stdout };

        let _ = window.emit("download-progress", DownloadProgress {
            status: "error".to_string(),
            message: error_msg.clone(),
        });
        return Err(error_msg);
    }

    let _ = window.emit("download-progress", DownloadProgress {
        status: "done".to_string(),
        message: "Download complete!".to_string(),
    });

    Ok("Download complete!".to_string())
}

#[tauri::command]
pub async fn get_default_download_dir() -> String {
    // Returns user's Downloads folder
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
