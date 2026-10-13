use std::{fs, path::{Component, Path, PathBuf}};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use crate::{error::{BackendError, Result}, workspace::reject_link_or_reparse};

const MAX_REFERENCE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReferenceMaterial {
    id: String,
    title: String,
    category: String,
    source_label: String,
    relative_path: String,
    format: String,
    size: u64,
    sha256: String,
    status: String,
}

pub fn list(root: &Path) -> Result<Vec<ReferenceMaterial>> {
    let directory = root.join("library-assets");
    if !directory.exists() { return Ok(vec![]); }
    reject_link_or_reparse(&directory, "reference directory")?;
    let path = directory.join("catalog.json");
    reject_link_or_reparse(&path, "reference catalog")?;
    if fs::metadata(&path)?.len() > 8 * 1024 * 1024 { return Err(BackendError::InvalidInput("Reference catalog is too large.".into())); }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn resolve(root: &Path, material: &ReferenceMaterial) -> Result<PathBuf> {
    let relative = Path::new(&material.relative_path);
    if relative.is_absolute() || relative.components().any(|c| !matches!(c, Component::Normal(_))) || material.relative_path.contains('\\') {
        return Err(BackendError::InvalidInput("Invalid reference resource path.".into()));
    }
    let directory = root.join("library-assets");
    let mut candidate = directory.clone();
    for part in relative.components() { candidate.push(part); reject_link_or_reparse(&candidate, "reference resource")?; }
    let actual = fs::canonicalize(&candidate)?;
    if !actual.starts_with(fs::canonicalize(directory)?) || !actual.is_file() || fs::metadata(&actual)?.len() != material.size {
        return Err(BackendError::InvalidInput("Reference resource is missing or changed.".into()));
    }
    let ext = actual.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    if !matches!(ext.as_str(), "pdf" | "docx" | "mp3" | "m4a" | "wma") {
        return Err(BackendError::InvalidInput("This source format is preserved for recovery but cannot be opened here.".into()));
    }
    Ok(actual)
}

pub fn open(root: &Path, id: &str) -> Result<()> {
    let material = list(root)?.into_iter().find(|m| m.id == id)
        .ok_or_else(|| BackendError::InvalidInput("Unknown reference material.".into()))?;
    let path = resolve(root, &material)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe").arg(path).creation_flags(0x08000000).spawn()?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = path; Err(BackendError::InvalidInput("Reference opening requires Windows.".into())) }
}

/// Store an imported source PDF as a content-addressed recovery file. The
/// renderer never receives a path and the study pack remains text-first.
pub fn archive(root: &Path, file_name: &str, base64: &str) -> Result<ReferenceMaterial> {
    let name = Path::new(file_name);
    if file_name.trim().is_empty()
        || file_name.len() > 240
        || name.components().count() != 1
        || !file_name.to_ascii_lowercase().ends_with(".pdf")
    {
        return Err(BackendError::InvalidInput("The archived source must be a PDF file name.".into()));
    }
    if base64.len() > (MAX_REFERENCE_BYTES * 4 / 3) + 4 {
        return Err(BackendError::InvalidInput("The source PDF is too large to archive.".into()));
    }
    let bytes = STANDARD.decode(base64)
        .map_err(|_| BackendError::InvalidInput("The source PDF encoding is invalid.".into()))?;
    if bytes.is_empty() || bytes.len() > MAX_REFERENCE_BYTES || !bytes[..bytes.len().min(1024)].windows(5).any(|window| window == b"%PDF-") {
        return Err(BackendError::InvalidInput("The archived source is not a valid PDF payload.".into()));
    }

    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    let mut materials = if root.join("library-assets/catalog.json").exists() { list(root)? } else { Vec::new() };
    if let Some(existing) = materials.iter().find(|item| item.id == sha256).cloned() {
        resolve(root, &existing)?;
        return Ok(existing);
    }

    let directory = root.join("library-assets");
    let objects = directory.join("objects");
    fs::create_dir_all(&objects)?;
    reject_link_or_reparse(&directory, "reference directory")?;
    reject_link_or_reparse(&objects, "reference objects")?;
    let relative_path = format!("objects/{sha256}.pdf");
    let target = objects.join(format!("{sha256}.pdf"));
    if target.exists() {
        if fs::read(&target)? != bytes {
            return Err(BackendError::Conflict("An archived source hash points to different bytes.".into()));
        }
    } else {
        fs::write(&target, &bytes)?;
    }
    let material = ReferenceMaterial {
        id: sha256.clone(),
        title: file_name.to_string(),
        category: "Test materials".into(),
        source_label: "Imported local PDF source".into(),
        relative_path,
        format: ".pdf".into(),
        size: bytes.len() as u64,
        sha256,
        status: "Archived source; study text is used in Reading".into(),
    };
    materials.push(material.clone());
    fs::write(directory.join("catalog.json"), serde_json::to_vec_pretty(&materials)?)?;
    Ok(material)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_escape_and_executable_resources() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("library-assets/objects")).unwrap();
        let mut item = ReferenceMaterial { id: "a".into(), title: "a".into(), category: "a".into(), source_label: "a".into(), relative_path: "../escape.pdf".into(), format: ".pdf".into(), size: 0, sha256: "a".into(), status: "a".into() };
        assert!(resolve(root.path(), &item).is_err());
        item.relative_path = "objects/test.exe".into();
        fs::write(root.path().join("library-assets/objects/test.exe"), b"").unwrap();
        assert!(resolve(root.path(), &item).is_err());
    }

    #[test]
    fn archives_a_pdf_once_and_keeps_a_catalog_entry() {
        let root = tempfile::tempdir().unwrap();
        let bytes = b"%PDF-1.7\nsource";
        let encoded = STANDARD.encode(bytes);
        let first = archive(root.path(), "cet6-source.pdf", &encoded).unwrap();
        let second = archive(root.path(), "cet6-source.pdf", &encoded).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(list(root.path()).unwrap().len(), 1);
        assert_eq!(fs::read(root.path().join("library-assets").join(&first.relative_path)).unwrap(), bytes);
    }
}
