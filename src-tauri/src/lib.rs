mod script_updater;

use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Launch queue worker sidecar
      let api_url = std::env::var("QALAM_API_URL")
          .unwrap_or_else(|_| "http://localhost:5050".to_string());

      // Find Python path: prefer the playwright venv (has playwright + deps),
      // otherwise fall back to system python3.
      let venv_python = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
          .join("../playwright/venv/bin/python");
      let python_path = if venv_python.exists() {
          venv_python.canonicalize()
              .map(|p| p.to_string_lossy().to_string())
              .unwrap_or_else(|_| venv_python.to_string_lossy().to_string())
      } else {
          std::process::Command::new("which")
              .arg("python3")
              .output()
              .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
              .unwrap_or_else(|_| "/usr/bin/python3".to_string())
      };

      println!("[TAURI] Launching qalam-worker sidecar...");
      println!("[TAURI] API URL: {}", api_url);
      println!("[TAURI] Python path: {}", python_path);

      match app.shell()
          .sidecar("qalam-worker") {
          Ok(cmd) => {
              let resources_dir = app.path().resource_dir()
                      .unwrap_or_default()
                      .to_string_lossy()
                      .to_string();

                      let sidecar_command = cmd
                  .env("QALAM_API_URL", &api_url)
                  .env("QALAM_TIMEZONE", "Asia/Karachi")
                  .env("QALAM_RESOURCES_DIR", &resources_dir)
                  .env("QALAM_PYTHON", &python_path);

              match sidecar_command.spawn() {
                  Ok((mut rx, child)) => {
                      println!("[TAURI] qalam-worker spawned successfully");
                      app.manage(child);

                      // Spawn a thread to read and print worker output
                      tauri::async_runtime::spawn(async move {
                          use tauri_plugin_shell::process::CommandEvent;
                          while let Some(event) = rx.recv().await {
                              match event {
                                  CommandEvent::Stdout(line) => {
                                      println!("[WORKER] {}", String::from_utf8_lossy(&line));
                                  }
                                  CommandEvent::Stderr(line) => {
                                      eprintln!("[WORKER ERR] {}", String::from_utf8_lossy(&line));
                                  }
                                  CommandEvent::Error(e) => {
                                      eprintln!("[WORKER ERROR] {}", e);
                                  }
                                  CommandEvent::Terminated(status) => {
                                      eprintln!("[WORKER] Terminated: {:?}", status);
                                      break;
                                  }
                                  _ => {}
                              }
                          }
                      });
                  }
                  Err(e) => {
                      eprintln!("[TAURI] Failed to spawn qalam-worker: {}", e);
                  }
              }
          }
          Err(e) => {
              eprintln!("[TAURI] Failed to create sidecar command: {}", e);
          }
      }

      // Check for linkedin_actions.py updates (runs in background thread)
      let resources_dir_pb = app.path().resource_dir()
          .unwrap_or_else(|_| PathBuf::from("."));
      let api_url_for_updater = api_url.clone();
      script_updater::check_and_update(resources_dir_pb, api_url_for_updater);

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
