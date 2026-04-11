mod script_updater;

use std::path::PathBuf;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ── STEP 2: Autostart on login ─────────────────────────────────
            {
                use tauri_plugin_autostart::ManagerExt;
                let autostart_manager = app.autolaunch();
                if !autostart_manager.is_enabled().unwrap_or(false) {
                    let _ = autostart_manager.enable();
                    println!("[AUTOSTART] Enabled autostart on login");
                }
            }

            // ── STEP 1: System tray ────────────────────────────────────────
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Qalam — LinkedIn Automation")
                .menu(&tauri::menu::Menu::with_items(
                    app,
                    &[
                        &tauri::menu::MenuItem::with_id(
                            app, "show", "Open Qalam", true, None::<&str>,
                        )?,
                        &tauri::menu::PredefinedMenuItem::separator(app)?,
                        &tauri::menu::MenuItem::with_id(
                            app, "quit", "Quit", true, None::<&str>,
                        )?,
                    ],
                )?)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Hide window on close instead of quitting
            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_clone.hide();
                }
            });

            // ── Worker environment setup ───────────────────────────────────
            let api_url = std::env::var("QALAM_API_URL")
                .unwrap_or_else(|_| "https://api.byqalam.com".to_string());

            let venv_python = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../playwright/venv/bin/python");
            let python_path = if venv_python.exists() {
                venv_python
                    .canonicalize()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| venv_python.to_string_lossy().to_string())
            } else {
                std::process::Command::new("which")
                    .arg("python3")
                    .output()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                    .unwrap_or_else(|_| "/usr/bin/python3".to_string())
            };

            let resources_dir = app
                .path()
                .resource_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            println!("[TAURI] API URL: {}", api_url);
            println!("[TAURI] Python path: {}", python_path);

            // ── STEP 4: Watchdog — restarts worker on crash ────────────────
            let app_handle_watchdog = app.handle().clone();
            let api_url_watchdog = api_url.clone();
            let python_path_watchdog = python_path.clone();
            let resources_dir_watchdog = resources_dir.clone();

            tauri::async_runtime::spawn(async move {
                loop {
                    println!("[WATCHDOG] Starting qalam-worker...");

                    match app_handle_watchdog.shell().sidecar("qalam-worker") {
                        Ok(cmd) => {
                            match cmd
                                .env("QALAM_API_URL", &api_url_watchdog)
                                .env("QALAM_TIMEZONE", "Asia/Karachi")
                                .env("QALAM_PYTHON", &python_path_watchdog)
                                .env("QALAM_RESOURCES_DIR", &resources_dir_watchdog)
                                .spawn()
                            {
                                Ok((mut rx, child)) => {
                                    println!(
                                        "[WATCHDOG] Worker started (PID managed by Tauri)"
                                    );

                                    while let Some(event) = rx.recv().await {
                                        match event {
                                            tauri_plugin_shell::process::CommandEvent::Stdout(
                                                line,
                                            ) => {
                                                println!(
                                                    "[WORKER] {}",
                                                    String::from_utf8_lossy(&line)
                                                );
                                            }
                                            tauri_plugin_shell::process::CommandEvent::Stderr(
                                                line,
                                            ) => {
                                                eprintln!(
                                                    "[WORKER ERR] {}",
                                                    String::from_utf8_lossy(&line)
                                                );
                                            }
                                            tauri_plugin_shell::process::CommandEvent::Terminated(
                                                status,
                                            ) => {
                                                eprintln!(
                                                    "[WATCHDOG] Worker terminated: {:?}",
                                                    status
                                                );
                                                break;
                                            }
                                            _ => {}
                                        }
                                    }
                                    drop(child);
                                }
                                Err(e) => {
                                    eprintln!("[WATCHDOG] Failed to start worker: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[WATCHDOG] Failed to create sidecar: {}", e);
                        }
                    }

                    println!("[WATCHDOG] Restarting worker in 5 seconds...");
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            });

            // ── Script hotfix updater ──────────────────────────────────────
            let resources_dir_pb = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let api_url_for_updater = api_url.clone();
            script_updater::check_and_update(resources_dir_pb, api_url_for_updater);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
