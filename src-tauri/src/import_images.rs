//! Immutable, content-addressed PDF crops. No arbitrary path is accepted from the renderer.
use std::{fs, io::{Cursor, Write}, path::PathBuf};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use sha2::{Digest, Sha256};
use crate::{error::{BackendError, Result}, workspace::{Workspace, ensure_existing_within, reject_link_or_reparse}};

pub const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportImage {
    pub id: String, pub relative_path: String, pub sha256: String,
    pub width: u32, pub height: u32, pub byte_length: usize,
}

fn invalid(message: &str) -> BackendError { BackendError::InvalidInput(message.into()) }

pub fn validate_png(bytes: &[u8]) -> Result<(u32, u32)> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES { return Err(invalid("Image must be a PNG smaller than 8 MiB.")); }
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_limits(png::Limits { bytes: 64 * 1024 * 1024 });
    let mut reader = decoder.read_info().map_err(|_| invalid("Invalid PNG image."))?;
    let (width, height) = (reader.info().width, reader.info().height);
    if width == 0 || height == 0 || width > 6000 || height > 6000 || u64::from(width) * u64::from(height) > 12_000_000 {
        return Err(invalid("Image dimensions exceed the safe 12 megapixel limit."));
    }
    let size = reader.output_buffer_size().filter(|size| *size <= 64 * 1024 * 1024).ok_or_else(|| invalid("Image decoded size is too large."))?;
    reader.next_frame(&mut vec![0; size]).map_err(|_| invalid("PNG pixels are damaged."))?;
    Ok((width, height))
}

fn directory(workspace: &Workspace, draft_id: &str, create: bool) -> Result<PathBuf> {
    if draft_id.is_empty() || draft_id.len() > 128 || !draft_id.bytes().all(|ch| ch.is_ascii_alphanumeric() || ch == b'-' || ch == b'_') {
        return Err(invalid("Invalid import draft ID."));
    }
    let imports = workspace.root().join("imports");
    reject_link_or_reparse(&imports, "imports")?;
    ensure_existing_within(workspace.root(), &imports)?;
    let path = imports.join(format!("visual-{draft_id}"));
    if create && !path.exists() { fs::create_dir(&path)?; }
    reject_link_or_reparse(&path, "draft images")?;
    ensure_existing_within(workspace.root(), &path)
}

fn asset_file(workspace: &Workspace, draft_id: &str, asset_id: &str) -> Result<PathBuf> {
    let hash = asset_id.strip_prefix("visual-").ok_or_else(|| invalid("Invalid visual asset ID."))?;
    if hash.len() != 64 || !hash.bytes().all(|ch| ch.is_ascii_digit() || (b'a'..=b'f').contains(&ch)) { return Err(invalid("Invalid visual asset ID.")); }
    let folder = directory(workspace, draft_id, false)?;
    let path = folder.join(format!("{asset_id}.png"));
    reject_link_or_reparse(&path, "draft image")?;
    ensure_existing_within(&folder, &path)
}

pub fn read(workspace: &Workspace, draft_id: &str, asset_id: &str) -> Result<Vec<u8>> {
    let path = asset_file(workspace, draft_id, asset_id)?;
    if fs::metadata(&path)?.len() > MAX_IMAGE_BYTES as u64 { return Err(invalid("Draft image is too large.")); }
    let bytes = fs::read(path)?;
    if format!("visual-{:x}", Sha256::digest(&bytes)) != asset_id { return Err(invalid("Draft image hash mismatch.")); }
    validate_png(&bytes)?;
    Ok(bytes)
}

pub fn save(workspace: &Workspace, draft_id: &str, base64: &str) -> Result<ImportImage> {
    if base64.len() > MAX_IMAGE_BYTES * 4 / 3 + 4 { return Err(invalid("Image payload is too large.")); }
    let bytes = STANDARD.decode(base64).map_err(|_| invalid("Invalid image encoding."))?;
    let (width, height) = validate_png(&bytes)?;
    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    let id = format!("visual-{sha256}");
    let folder = directory(workspace, draft_id, true)?;
    let path = folder.join(format!("{id}.png"));
    if path.exists() {
        read(workspace, draft_id, &id)?;
    } else {
        if fs::read_dir(&folder)?.count() >= 100 { return Err(invalid("A draft may hold at most 100 visual images.")); }
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(path)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
    }
    Ok(ImportImage { relative_path: format!("media/images/{id}.png"), id, sha256, width, height, byte_length: bytes.len() })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn png() -> Vec<u8> {
        let mut bytes = Vec::new();
        { let mut encoder = png::Encoder::new(&mut bytes, 2, 2); encoder.set_color(png::ColorType::Rgb); encoder.set_depth(png::BitDepth::Eight);
          encoder.write_header().unwrap().write_image_data(&[200; 12]).unwrap(); }
        bytes
    }
    #[test]
    fn image_round_trip_is_immutable_and_survives_workspace_reopen() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::initialize(root.path().to_str().unwrap()).unwrap();
        crate::storage::initialize_database(&workspace.database_path()).unwrap();
        let bytes = png();
        let first = save(&workspace, "draft-1", &STANDARD.encode(&bytes)).unwrap();
        assert_eq!(first.id, save(&workspace, "draft-1", &STANDARD.encode(&bytes)).unwrap().id);
        let reopened = Workspace::open(root.path().to_str().unwrap()).unwrap();
        assert_eq!(read(&reopened, "draft-1", &first.id).unwrap(), bytes);
        assert!(read(&reopened, "draft-2", &first.id).is_err());
    }
    #[test]
    fn rejects_path_traversal_bad_png_and_tampered_image() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::initialize(root.path().to_str().unwrap()).unwrap();
        assert!(save(&workspace, "../escape", &STANDARD.encode(png())).is_err());
        assert!(save(&workspace, "draft-1", &STANDARD.encode(b"not png")).is_err());
        let image = save(&workspace, "draft-1", &STANDARD.encode(png())).unwrap();
        fs::write(asset_file(&workspace, "draft-1", &image.id).unwrap(), b"damaged").unwrap();
        assert!(read(&workspace, "draft-1", &image.id).is_err());
        assert!(read(&workspace, "draft-1", "../../outside").is_err());
    }
}
