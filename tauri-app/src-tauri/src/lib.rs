use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub status: String,
    pub message: String,
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
        message: "Starting yt-dlp...".to_string(),
    });

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

    // Spawn yt-dlp — no console window, capture stdout for progress
    let mut cmd = Command::new("yt-dlp");
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start yt-dlp: {}. Make sure yt-dlp is installed.", e))?;

    // Read stdout line by line for progress updates
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                if !line.trim().is_empty() {
                    let _ = window.emit("download-progress", DownloadProgress {
                        status: "downloading".to_string(),
                        message: line.clone(),
                    });
                }
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
