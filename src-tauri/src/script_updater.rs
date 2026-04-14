use std::path::PathBuf;
use std::fs;
use sha2::{Sha256, Digest};

const VERSION_FILE: &str = "linkedin_actions_version.txt";

/// Print only in debug builds
macro_rules! debug_println {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        println!($($arg)*);
    };
}

#[derive(serde::Deserialize)]
struct VersionInfo {
    version: String,
    checksum: String,
}

pub fn get_local_version(resources_dir: &PathBuf) -> String {
    let version_file = resources_dir.join(VERSION_FILE);
    fs::read_to_string(&version_file)
        .unwrap_or_else(|_| "0.0.0".to_string())
        .trim()
        .to_string()
}

pub fn save_local_version(resources_dir: &PathBuf, version: &str) {
    let version_file = resources_dir.join(VERSION_FILE);
    let _ = fs::write(version_file, version);
}

pub fn check_and_update(resources_dir: PathBuf, api_base: String) {
    std::thread::spawn(move || {
        debug_println!("[UPDATER] Checking for script updates...");

        let version_url = format!("{}/updater/version.json", api_base);
        let client = match reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                debug_println!("[UPDATER] Failed to build HTTP client: {}", e);
                return;
            }
        };

        let remote_info = match client.get(&version_url).send() {
            Ok(resp) => match resp.json::<VersionInfo>() {
                Ok(info) => info,
                Err(e) => {
                    debug_println!("[UPDATER] Failed to parse version info: {}", e);
                    return;
                }
            },
            Err(e) => {
                debug_println!("[UPDATER] Cannot reach update server: {}", e);
                return;
            }
        };

        let local_version = get_local_version(&resources_dir);

        if local_version == remote_info.version {
            debug_println!("[UPDATER] Script is up to date (v{})", local_version);
            return;
        }

        debug_println!(
            "[UPDATER] Update available: {} -> {}",
            local_version, remote_info.version
        );

        let script_url = format!("{}/updater/linkedin_actions.py", api_base);
        let content = match client.get(&script_url).send() {
            Ok(resp) => match resp.bytes() {
                Ok(bytes) => bytes,
                Err(e) => {
                    debug_println!("[UPDATER] Download failed: {}", e);
                    return;
                }
            },
            Err(e) => {
                debug_println!("[UPDATER] Download request failed: {}", e);
                return;
            }
        };

        let mut hasher = Sha256::new();
        hasher.update(&content);
        let checksum = hex::encode(hasher.finalize());

        if checksum != remote_info.checksum {
            debug_println!("[UPDATER] Checksum mismatch - aborting update");
            return;
        }

        let script_path = resources_dir.join("linkedin_actions.py");
        match fs::write(&script_path, &content) {
            Ok(_) => {
                save_local_version(&resources_dir, &remote_info.version);
                debug_println!("[UPDATER] Script updated to v{}", remote_info.version);
            }
            Err(e) => {
                debug_println!("[UPDATER] Failed to write script: {}", e);
            }
        }
    });
}
