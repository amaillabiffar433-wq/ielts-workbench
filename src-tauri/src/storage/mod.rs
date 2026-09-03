mod migrations;
pub mod repositories;

use std::{path::Path, time::Duration};

use rusqlite::{Connection, OpenFlags};

use crate::error::Result;

pub fn initialize_database(path: &Path) -> Result<()> {
    let mut connection = open_connection(path)?;
    migrations::run(&mut connection)
}

pub fn open_database(path: &Path) -> Result<Connection> {
    let mut connection = open_connection(path)?;
    migrations::run(&mut connection)?;
    Ok(connection)
}

fn open_connection(path: &Path) -> Result<Connection> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(connection)
}

