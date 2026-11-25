//! The log file and its one backup: past MAX_BYTES the file becomes `fly-island.1.log`
//! (replacing the older one) and a new file starts, so the log never takes more than twice that.

use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::Path,
};

pub(super) const FILE_NAME: &str = "fly-island.log";
pub(super) const BACKUP_NAME: &str = "fly-island.1.log";
pub(super) const MAX_BYTES: u64 = 5 * 1024 * 1024;

pub(super) struct LogFile {
    file: File,
    bytes: u64,
    dir: std::path::PathBuf,
}

impl LogFile {
    pub(super) fn open(dir: &Path) -> Option<Self> {
        fs::create_dir_all(dir).ok()?;
        let file = OpenOptions::new().create(true).append(true).open(dir.join(FILE_NAME)).ok()?;
        let bytes = file.metadata().map(|meta| meta.len()).unwrap_or(0);
        Some(Self { file, bytes, dir: dir.to_path_buf() })
    }

    pub(super) fn write(&mut self, line: &str) -> io::Result<()> {
        if self.bytes + line.len() as u64 > MAX_BYTES && self.bytes > 0 {
            self.rotate()?;
        }
        self.file.write_all(line.as_bytes())?;
        self.bytes += line.len() as u64;
        Ok(())
    }

    fn rotate(&mut self) -> io::Result<()> {
        let backup = self.dir.join(BACKUP_NAME);
        let _ = fs::remove_file(&backup);
        fs::rename(self.dir.join(FILE_NAME), &backup)?;
        self.file = OpenOptions::new().create(true).append(true).open(self.dir.join(FILE_NAME))?;
        self.bytes = 0;
        Ok(())
    }
}

pub(super) fn total_bytes(dir: &Path) -> u64 {
    [FILE_NAME, BACKUP_NAME].iter().filter_map(|name| fs::metadata(dir.join(name)).ok()).map(|meta| meta.len()).sum()
}

pub(super) fn remove_all(dir: &Path) -> io::Result<()> {
    for name in [FILE_NAME, BACKUP_NAME] {
        match fs::remove_file(dir.join(name)) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotates_into_one_backup_and_clears_both() {
        let dir = std::env::temp_dir().join(format!("fly-island-log-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut log = LogFile::open(&dir).unwrap();
        let line = "x".repeat(1024 * 1024) + "\n";
        for _ in 0..12 {
            log.write(&line).unwrap();
        }
        assert!(dir.join(BACKUP_NAME).is_file());
        assert!(total_bytes(&dir) <= 2 * MAX_BYTES);
        assert!(fs::metadata(dir.join(FILE_NAME)).unwrap().len() <= MAX_BYTES);
        drop(log);
        remove_all(&dir).unwrap();
        assert_eq!(total_bytes(&dir), 0);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn log_contract_uses_the_current_product_name() {
        assert_eq!(FILE_NAME, "fly-island.log");
    }
}
