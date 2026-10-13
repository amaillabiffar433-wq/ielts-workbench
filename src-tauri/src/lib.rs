mod backend;
mod backup;
mod commands;
mod error;
mod models;
mod obsidian;
mod reference_materials;
mod speaking;
mod speaking_commands;
mod import_images;
mod packs;
mod storage;
mod workspace;

use backend::AppBackend;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let backend = if let Some(index) = args.iter().position(|arg| arg == "--workspace") {
                let path = args.get(index + 1).ok_or("--workspace requires an existing workspace path")?;
                let selected = workspace::Workspace::open(path)?;
                let backend = AppBackend::new(selected.root().join("logs").join("luma-launch"));
                backend.initialize_workspace(path)?;
                backend
            } else {
                AppBackend::new(app.path().app_config_dir()?)
            };
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap_state,
            speaking_commands::speaking_topics,
            speaking_commands::speaking_sessions,
            speaking_commands::speaking_start,
            speaking_commands::speaking_save,
            speaking_commands::speaking_favorites,
            speaking_commands::speaking_favorite,
            speaking_commands::speaking_recordings,
            speaking_commands::speaking_record,
            speaking_commands::speaking_audio,
            commands::list_reference_materials,
            commands::open_reference_material,
            commands::archive_reference_material,
            commands::initialize_workspace,
            commands::list_installed_packs,
            commands::load_pack,
            commands::create_session,
            commands::load_session,
            commands::list_recent_sessions,
            commands::submit_session,
            commands::update_session_elapsed,
            commands::create_workspace_backup,
            commands::restore_workspace_backup,
            commands::export_obsidian_daily_brief,
            commands::save_answer,
            commands::save_annotation,
            commands::delete_annotation,
            commands::list_vocabulary_items,
            commands::save_vocabulary_item,
            commands::update_vocabulary_item,
            commands::delete_vocabulary_item,
            commands::list_review_items,
            commands::save_review_item,
            commands::grade_review_item,
            commands::get_setting,
            commands::set_setting,
            commands::load_writing_draft,
            commands::save_writing_draft,
            commands::create_writing_version,
            commands::list_writing_versions,
            commands::validate_pack_folder,
            commands::install_pack,
            commands::install_generated_pack,
            commands::read_pack_media,
            commands::select_pdf_file,
            commands::save_import_image,
            commands::read_import_image,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Luma");
}
