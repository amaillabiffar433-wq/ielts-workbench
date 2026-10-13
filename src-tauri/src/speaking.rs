use std::{fs,io::Write,path::{Path,PathBuf},time::Duration};
use base64::{engine::general_purpose::STANDARD,Engine as _};
use chrono::Utc;
use rusqlite::{params,Connection,OptionalExtension};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use uuid::Uuid;
use crate::{error::{BackendError,Result},workspace::reject_link_or_reparse};

#[derive(Clone,Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Topic {
 pub id:String,pub title:String,pub part:u8,pub category:String,pub prompts:Vec<String>,pub source_title:String,
 pub source_sha256:String,pub source_page:Option<u32>,pub reference_id:String,pub source_version:String,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct SpeakingSession {pub id:String,pub topic_id:String,pub status:String,pub elapsed_seconds:u32,pub notes:String,pub created_at:String,pub updated_at:String,pub completed_at:Option<String>}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Recording {pub id:String,pub session_id:String,pub sha256:String,pub byte_length:u64,pub mime_type:String,pub created_at:String}

fn id(value:&str)->Result<()> {if value.is_empty()||value.len()>160||!value.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'){return Err(BackendError::InvalidInput("Invalid speaking identity.".into()));}Ok(())}
pub fn topics(root:&Path)->Result<Vec<Topic>> {
 let folder=root.join("speaking-materials");if !folder.exists(){return Ok(vec![])}reject_link_or_reparse(&folder,"speaking materials")?;
 let file=folder.join("catalog.json");reject_link_or_reparse(&file,"speaking catalog")?;
 if fs::metadata(&file)?.len()>16*1024*1024{return Err(BackendError::InvalidInput("Speaking catalog exceeds the limit.".into()))}
 let topics:Vec<Topic>=serde_json::from_slice(&fs::read(file)?)?;let mut ids=std::collections::HashSet::new();
 for t in &topics {id(&t.id)?;if !(1..=3).contains(&t.part)||t.prompts.is_empty()||t.prompts.len()>80||t.prompts.iter().any(|p|p.trim().is_empty()||p.len()>12000)||!ids.insert(&t.id){return Err(BackendError::InvalidInput("Invalid or duplicate speaking topic.".into()))}}
 for t in &topics {if t.title.trim().is_empty()||t.title.len()>1500||t.category.trim().is_empty()||t.source_title.trim().is_empty()||t.source_version.trim().is_empty()||t.source_page==Some(0)||[&t.source_sha256,&t.reference_id].iter().any(|v|v.len()!=64||!v.bytes().all(|b|b.is_ascii_hexdigit()&&!b.is_ascii_uppercase())){return Err(BackendError::InvalidInput("Invalid speaking source metadata.".into()))}}
 Ok(topics)
}
pub fn database(root:&Path)->Result<Connection> {
 let path=root.join("speaking.sqlite3");if path.exists(){reject_link_or_reparse(&path,"speaking database")?;}
 let c=Connection::open(path)?;c.busy_timeout(Duration::from_secs(5))?;c.pragma_update(None,"foreign_keys","ON")?;c.pragma_update(None,"journal_mode","WAL")?;
 let exists:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')",[],|r|r.get(0))?;
 if !exists {c.execute_batch("BEGIN IMMEDIATE")?;if let Err(e)=c.execute_batch(include_str!("../migrations/speaking/0001_practice.sql")){let _=c.execute_batch("ROLLBACK");return Err(e.into())}c.execute_batch("COMMIT")?;}
 let version:i64=c.query_row("SELECT MAX(version) FROM schema_migrations",[],|r|r.get(0))?;if version!=1{return Err(BackendError::Conflict("Unsupported speaking database version.".into()))}Ok(c)
}
fn row(r:&rusqlite::Row<'_>)->rusqlite::Result<SpeakingSession>{Ok(SpeakingSession{id:r.get(0)?,topic_id:r.get(1)?,status:r.get(2)?,elapsed_seconds:r.get(3)?,notes:r.get(4)?,created_at:r.get(5)?,updated_at:r.get(6)?,completed_at:r.get(7)?})}
pub fn sessions(root:&Path)->Result<Vec<SpeakingSession>> {let c=database(root)?;let mut stmt=c.prepare("SELECT id,topic_id,status,elapsed_seconds,notes,created_at,updated_at,completed_at FROM speaking_sessions ORDER BY updated_at DESC")?;let records=stmt.query_map([],row)?.collect::<std::result::Result<Vec<_>,_>>()?;Ok(records)}
pub fn start(root:&Path,topic_id:&str)->Result<SpeakingSession> {
 id(topic_id)?;if !topics(root)?.iter().any(|t|t.id==topic_id){return Err(BackendError::NotFound("Speaking topic not installed.".into()))}
 let c=database(root)?;
 let existing=c.query_row("SELECT id,topic_id,status,elapsed_seconds,notes,created_at,updated_at,completed_at FROM speaking_sessions WHERE topic_id=?1 AND status='in-progress' ORDER BY updated_at DESC LIMIT 1",[topic_id],row).optional()?;
 if let Some(s)=existing{return Ok(s)}
 let session_id=Uuid::new_v4().to_string();let now=Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true);
 c.execute("INSERT INTO speaking_sessions(id,topic_id,status,created_at,updated_at) VALUES(?1,?2,'in-progress',?3,?3)",params![session_id,topic_id,now])?;
 Ok(c.query_row("SELECT id,topic_id,status,elapsed_seconds,notes,created_at,updated_at,completed_at FROM speaking_sessions WHERE id=?1",[session_id],row)?)
}
pub fn save_session(root:&Path,session_id:&str,elapsed:u32,notes:&str,complete:bool)->Result<SpeakingSession> {
 id(session_id)?;if elapsed>86400||notes.len()>20000{return Err(BackendError::InvalidInput("Speaking notes or duration exceed the limit.".into()))}
 let c=database(root)?;let now=Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true);
 let changed=c.execute("UPDATE speaking_sessions SET elapsed_seconds=MAX(elapsed_seconds,?2),notes=?3,updated_at=?4,status=CASE WHEN ?5 THEN 'completed' ELSE status END,completed_at=CASE WHEN ?5 THEN COALESCE(completed_at,?4) ELSE completed_at END WHERE id=?1 AND status='in-progress'",params![session_id,elapsed,notes,now,complete])?;
 if changed==0{return Err(BackendError::Conflict("This speaking attempt is already completed or unavailable.".into()))}
 Ok(c.query_row("SELECT id,topic_id,status,elapsed_seconds,notes,created_at,updated_at,completed_at FROM speaking_sessions WHERE id=?1",[session_id],row)?)
}
pub fn favorites(root:&Path)->Result<Vec<String>> {let c=database(root)?;let mut s=c.prepare("SELECT topic_id FROM speaking_favorites ORDER BY topic_id")?;let v=s.query_map([],|r|r.get(0))?.collect::<std::result::Result<Vec<String>,_>>()?;Ok(v)}
pub fn set_favorite(root:&Path,topic_id:&str,favorite:bool)->Result<()> {id(topic_id)?;if !topics(root)?.iter().any(|t|t.id==topic_id){return Err(BackendError::NotFound("Topic unavailable.".into()))}let c=database(root)?;if favorite {c.execute("INSERT OR IGNORE INTO speaking_favorites(topic_id,created_at) VALUES(?1,?2)",params![topic_id,Utc::now().to_rfc3339()])?;}else {c.execute("DELETE FROM speaking_favorites WHERE topic_id=?1",[topic_id])?;}Ok(())}
fn recording_row(r:&rusqlite::Row<'_>)->rusqlite::Result<Recording>{Ok(Recording{id:r.get(0)?,session_id:r.get(1)?,sha256:r.get(2)?,byte_length:r.get(3)?,mime_type:r.get(4)?,created_at:r.get(5)?})}
pub fn recordings(root:&Path,session_id:&str)->Result<Vec<Recording>> {id(session_id)?;let c=database(root)?;let mut s=c.prepare("SELECT id,session_id,sha256,byte_length,mime_type,created_at FROM speaking_recordings WHERE session_id=?1 ORDER BY created_at",)?;let v=s.query_map([session_id],recording_row)?.collect::<std::result::Result<Vec<_>,_>>()?;Ok(v)}
pub fn save_recording(root:&Path,session_id:&str,encoded:&str)->Result<Recording> {
 id(session_id)?;if encoded.len()>45*1024*1024{return Err(BackendError::InvalidInput("Recording exceeds 32 MiB.".into()))}
 let bytes=STANDARD.decode(encoded).map_err(|_|BackendError::InvalidInput("Invalid recording bytes.".into()))?;
 if bytes.len()<4||bytes.len()>32*1024*1024||bytes[..4]!=[0x1a,0x45,0xdf,0xa3]{return Err(BackendError::InvalidInput("Recording must be local WebM audio.".into()))}
 let c=database(root)?;let status:Option<String>=c.query_row("SELECT status FROM speaking_sessions WHERE id=?1",[session_id],|r|r.get(0)).optional()?;if status.as_deref()!=Some("in-progress"){return Err(BackendError::Conflict("Start or resume speaking before recording.".into()))}
 let folder=root.join("speaking-recordings");if !folder.exists(){fs::create_dir(&folder)?}reject_link_or_reparse(&folder,"recordings folder")?;
 let recording_id=Uuid::new_v4().to_string();let rel=format!("speaking-recordings/{recording_id}.webm");let target=root.join(&rel);
 let mut file=fs::OpenOptions::new().create_new(true).write(true).open(&target)?;file.write_all(&bytes)?;file.sync_all()?;
 let sha=format!("{:x}",Sha256::digest(&bytes));let now=Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true);
 if let Err(e)=c.execute("INSERT INTO speaking_recordings(id,session_id,relative_path,sha256,byte_length,mime_type,created_at) VALUES(?1,?2,?3,?4,?5,'audio/webm',?6)",params![recording_id,session_id,rel,sha,bytes.len() as i64,now]) {let _=fs::remove_file(target);return Err(e.into())}
 Ok(Recording{id:recording_id,session_id:session_id.into(),sha256:sha,byte_length:bytes.len() as u64,mime_type:"audio/webm".into(),created_at:now})
}
pub fn read_recording(root:&Path,recording_id:&str)->Result<String> {id(recording_id)?;let c=database(root)?;let (relative,expected):(String,String)=c.query_row("SELECT relative_path,sha256 FROM speaking_recordings WHERE id=?1",[recording_id],|r|Ok((r.get(0)?,r.get(1)?)))?;let rel=crate::workspace::validate_relative_path(&relative)?;if rel!=PathBuf::from(format!("speaking-recordings/{recording_id}.webm")){return Err(BackendError::Security("Recording identity/path mismatch.".into()))}let directory=root.join("speaking-recordings");reject_link_or_reparse(&directory,"recordings")?;let file=root.join(rel);reject_link_or_reparse(&file,"recording")?;if fs::metadata(&file)?.len()>32*1024*1024{return Err(BackendError::InvalidInput("Recording too large.".into()))}let bytes=fs::read(file)?;if format!("{:x}",Sha256::digest(&bytes))!=expected{return Err(BackendError::Conflict("Recording hash differs.".into()))}Ok(STANDARD.encode(bytes))}

#[cfg(test)]
mod tests {
 use super::*;
 fn fixture(root:&Path){fs::create_dir(root.join("speaking-materials")).unwrap();let topic=Topic{id:"original-topic".into(),title:"A useful personal project".into(),part:2,category:"Original test fixture".into(),prompts:vec!["Describe a project you made for yourself.".into()],source_title:"Original fixture".into(),source_sha256:"a".repeat(64),source_page:Some(1),reference_id:"b".repeat(64),source_version:"test fixture".into()};fs::write(root.join("speaking-materials/catalog.json"),serde_json::to_vec(&vec![topic]).unwrap()).unwrap();}
 #[test] fn durable_attempts_favorites_and_immutable_completion(){let tmp=tempfile::tempdir().unwrap();fixture(tmp.path());let first=start(tmp.path(),"original-topic").unwrap();assert_eq!(start(tmp.path(),"original-topic").unwrap().id,first.id);set_favorite(tmp.path(),"original-topic",true).unwrap();assert_eq!(favorites(tmp.path()).unwrap(),vec!["original-topic"]);save_session(tmp.path(),&first.id,17,"My own notes",false).unwrap();let restored=sessions(tmp.path()).unwrap();assert_eq!(restored[0].notes,"My own notes");assert_eq!(restored[0].elapsed_seconds,17);let done=save_session(tmp.path(),&first.id,10,"My own notes",true).unwrap();assert_eq!(done.elapsed_seconds,17);assert!(done.completed_at.is_some());assert!(save_session(tmp.path(),&first.id,20,"overwrite",false).is_err());assert_ne!(start(tmp.path(),"original-topic").unwrap().id,first.id);assert!(!tmp.path().join("database.sqlite3").exists());}
 #[test] fn recordings_detect_corruption_and_reject_path_escape(){let tmp=tempfile::tempdir().unwrap();fixture(tmp.path());let s=start(tmp.path(),"original-topic").unwrap();assert!(save_recording(tmp.path(),&s.id,"bm90LWF1ZGlv").is_err());let encoded=STANDARD.encode([0x1a,0x45,0xdf,0xa3,0,1,2,3]);let r=save_recording(tmp.path(),&s.id,&encoded).unwrap();assert_eq!(read_recording(tmp.path(),&r.id).unwrap(),encoded);fs::write(tmp.path().join(format!("speaking-recordings/{}.webm",r.id)),b"tampered").unwrap();assert!(read_recording(tmp.path(),&r.id).is_err());assert!(read_recording(tmp.path(),"../outside").is_err());assert_eq!(recordings(tmp.path(),&s.id).unwrap().len(),1);}
 #[test] fn unknown_and_duplicate_topics_are_rejected(){let tmp=tempfile::tempdir().unwrap();fixture(tmp.path());assert!(start(tmp.path(),"absent").is_err());let mut catalog=topics(tmp.path()).unwrap();catalog.push(catalog[0].clone());fs::write(tmp.path().join("speaking-materials/catalog.json"),serde_json::to_vec(&catalog).unwrap()).unwrap();assert!(topics(tmp.path()).is_err());}
}
