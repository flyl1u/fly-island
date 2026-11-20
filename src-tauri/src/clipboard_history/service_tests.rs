use super::{image_file_list_is_valid, MAX_IMAGE_PNG_BYTES};
use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

fn test_directory() -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock must be after the epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("fly-clipboard-files-{}-{suffix}", std::process::id()))
}

#[test]
fn image_file_lists_require_only_bounded_existing_image_files() {
    let directory = test_directory();
    fs::create_dir_all(&directory).expect("test directory should be created");
    let png = directory.join("one.PNG");
    let text = directory.join("notes.txt");
    let image_paths: Vec<String> = ["png", "jpg", "jpeg", "gif", "webp", "bmp"]
        .iter()
        .enumerate()
        .map(|(index, extension)| directory.join(format!("image-{index}.{extension}")))
        .map(|path| {
            fs::write(&path, b"image").expect("test image should be written");
            path.to_string_lossy().into_owned()
        })
        .collect();
    fs::write(&png, b"png").expect("test image should be written");
    fs::write(&text, b"text").expect("test text should be written");

    for path in &image_paths {
        assert!(image_file_list_is_valid(std::slice::from_ref(path)));
    }
    assert!(!image_file_list_is_valid(&image_paths));
    assert!(!image_file_list_is_valid(&[
        png.to_string_lossy().into_owned(),
        text.to_string_lossy().into_owned(),
    ]));
    assert!(!image_file_list_is_valid(&[
        directory.join("missing.png").to_string_lossy().into_owned(),
    ]));
    assert!(!image_file_list_is_valid(&[]));

    let oversized = directory.join("oversized.webp");
    let file = fs::File::create(&oversized).expect("oversized test file should be created");
    file.set_len(MAX_IMAGE_PNG_BYTES as u64 + 1)
        .expect("oversized test file should be extended");
    assert!(!image_file_list_is_valid(&[
        oversized.to_string_lossy().into_owned(),
    ]));

    fs::remove_dir_all(directory).expect("test directory should be removed");
}
