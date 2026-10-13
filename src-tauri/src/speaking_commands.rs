use tauri::State;
use crate::{backend::AppBackend, error::CommandError, speaking::{self, Topic, SpeakingSession, Recording}};
type Result<T> = std::result::Result<T, CommandError>;
#[tauri::command]
pub fn speaking_topics(state: State<'_, AppBackend>) -> Result<Vec<Topic>> { let (w,_) = state.workspace_and_database()?; speaking::topics(w.root()).map_err(Into::into) }
#[tauri::command]
pub fn speaking_sessions(state: State<'_, AppBackend>) -> Result<Vec<SpeakingSession>> { let (w,_) = state.workspace_and_database()?; speaking::sessions(w.root()).map_err(Into::into) }
#[tauri::command]
pub fn speaking_start(state: State<'_, AppBackend>, topic_id:String) -> Result<SpeakingSession> { let _guard=state.lock_mutation()?; let (w,_) = state.workspace_and_database()?; speaking::start(w.root(),&topic_id).map_err(Into::into) }
#[tauri::command]
pub fn speaking_save(state: State<'_, AppBackend>, session_id:String, elapsed:u32, notes:String, complete:bool) -> Result<SpeakingSession> { let _guard=state.lock_mutation()?; let (w,_) = state.workspace_and_database()?; speaking::save_session(w.root(),&session_id,elapsed,&notes,complete).map_err(Into::into) }
#[tauri::command]
pub fn speaking_favorites(state: State<'_, AppBackend>) -> Result<Vec<String>> { let (w,_) = state.workspace_and_database()?; speaking::favorites(w.root()).map_err(Into::into) }
#[tauri::command]
pub fn speaking_favorite(state: State<'_, AppBackend>, topic_id:String, favorite:bool) -> Result<()> { let _guard=state.lock_mutation()?; let (w,_) = state.workspace_and_database()?; speaking::set_favorite(w.root(),&topic_id,favorite).map_err(Into::into) }
#[tauri::command]
pub fn speaking_recordings(state: State<'_, AppBackend>, session_id:String) -> Result<Vec<Recording>> { let (w,_) = state.workspace_and_database()?; speaking::recordings(w.root(),&session_id).map_err(Into::into) }
#[tauri::command]
pub fn speaking_record(state: State<'_, AppBackend>, session_id:String, encoded:String) -> Result<Recording> { let _guard=state.lock_mutation()?; let (w,_) = state.workspace_and_database()?; speaking::save_recording(w.root(),&session_id,&encoded).map_err(Into::into) }
#[tauri::command]
pub fn speaking_audio(state: State<'_, AppBackend>, recording_id:String) -> Result<String> { let (w,_) = state.workspace_and_database()?; speaking::read_recording(w.root(),&recording_id).map_err(Into::into) }
