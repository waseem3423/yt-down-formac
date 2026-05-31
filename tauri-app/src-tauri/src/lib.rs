use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use std::thread;
use std::sync::mpsc;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub status: String,
    pub message: String,
    pub percent: f32,
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
    let quality = request.quality.clone();
    let output_dir = PathBuf::from(&request.output_dir);

    if !url.contains("youtube.com/watch?v=") && !url.contains("youtu.be/") {
        return Err("Invalid YouTube URL".to_string());
    }

    let _ = window.emit("download-progress", DownloadProgress {
        status: "downloading".to_string(),
        message: "Starting yt-dlp...".to_string(),
        percent: 0.0,
    });

    let output_template = output_dir
        .join("%(title)s.%(ext)s")
        .to_string_lossy()
        .to_string();

    let mut args: Vec<String> = vec![url.clone()];

    match quality.as_str() {
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
        "--progress".to_string(),
        "-o".to_string(), output_template,
    ]);

    let mut cmd = Command::new("yt-dlp");
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("yt-dlp not found: {}. Install with: pip install yt-dlp", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // Channel to collect all lines from both stdout and stderr
    let (tx, rx) = mpsc::channel::<String>();
    let tx2 = tx.clone();

    // Thread for stdout
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = tx.send(l);
            }
        }
    });

    // Thread for stderr
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = tx2.send(l);
            }
        }
    });

    // Process lines and emit progress
    for line in rx {
        let line = line.trim().to_string();
        if line.is_empty() { continue; }

        let percent = parse_percent(&line);

        let (status, msg) = if line.contains("[Merger]") || line.contains("Merging formats") {
            ("merging".to_string(), "Merging audio & video...".to_string())
        } else if line.contains("[ExtractAudio]") || line.contains("Destination:") && line.contains(".mp3") {
            ("merging".to_string(), "Converting to MP3...".to_string())
        } else {
            ("downloading".to_string(), line.clone())
        };

        let _ = window.emit("download-progress", DownloadProgress {
            status,
            message: msg,
            percent: percent.unwrap_or(0.0),
        });
    }

    let result = child.wait().map_err(|e| e.to_string())?;

    if !result.success() {
        let _ = window.emit("download-progress", DownloadProgress {
            status: "error".to_string(),
            message: "Download failed. Check the URL and try again.".to_string(),
            percent: 0.0,
        });
        return Err("Download failed".to_string());
    }

    let _ = window.emit("download-progress", DownloadProgress {
        status: "done".to_string(),
        message: "Download complete!".to_string(),
        percent: 100.0,
    });

    Ok("Done".to_string())
}

fn parse_percent(line: &str) -> Option<f32> {
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
