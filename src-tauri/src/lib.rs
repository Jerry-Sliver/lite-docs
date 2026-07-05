use std::{fs, path::Path};
use tauri::Emitter;

fn ldoc_paths_from_args(args: Vec<String>) -> Vec<String> {
  args
    .into_iter()
    .filter(|arg| Path::new(arg).extension().is_some_and(|ext| ext.eq_ignore_ascii_case("ldoc")))
    .collect()
}

#[tauri::command]
fn initial_open_files() -> Vec<String> {
  ldoc_paths_from_args(std::env::args().skip(1).collect())
}

#[tauri::command]
fn read_ldoc_file(path: String) -> Result<Vec<u8>, String> {
  if !Path::new(&path).extension().is_some_and(|ext| ext.eq_ignore_ascii_case("ldoc")) {
    return Err("只能打开 .ldoc 文件。".into());
  }
  fs::read(path).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
      let paths = ldoc_paths_from_args(args);
      if !paths.is_empty() {
        let _ = app.emit("ldoc-open", paths);
      }
    }))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![initial_open_files, read_ldoc_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
