use super::sheet::{image_header, sheet_rows, ImageHeader};
use super::*;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

/// The start of a PNG of this size (signature + IHDR).
fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR".to_vec();
    bytes.extend(width.to_be_bytes());
    bytes.extend(height.to_be_bytes());
    bytes.extend([8, 6, 0, 0, 0, 0, 0, 0, 0]); // depth, color type, ..., CRC
    bytes
}

/// The start of an extended (VP8X) WebP of this size.
fn webp_vp8x(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"RIFF\x00\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x10\x00\x00\x00".to_vec();
    bytes.extend(&(width - 1).to_le_bytes()[..3]);
    bytes.extend(&(height - 1).to_le_bytes()[..3]);
    bytes
}

/// The start of a lossless (VP8L) WebP of this size, the format of the petdex sheets.
fn webp_vp8l(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"RIFF\x00\x00\x00\x00WEBPVP8L\x00\x00\x00\x00\x2f".to_vec();
    bytes.extend(((width - 1) | (height - 1) << 14 | 1 << 28).to_le_bytes());
    bytes.extend([0; 5]);
    bytes
}

fn sheet_webp() -> Vec<u8> {
    webp_vp8l(1536, 1872)
}

/// A fresh `app/` and `codex/` pet root per test.
fn temp_roots() -> (PathBuf, Vec<(PetSource, PathBuf)>) {
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let base = std::env::temp_dir().join(format!(
        "focusd-pets-test-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&base);
    let roots = vec![
        (PetSource::App, base.join("app")),
        (PetSource::Codex, base.join("codex")),
    ];
    for (_, root) in &roots {
        fs::create_dir_all(root).unwrap();
    }
    (base, roots)
}

fn write_pet(root: &Path, id: &str, manifest: &str, sheet: &str, bytes: &[u8]) {
    let dir = root.join(id);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("pet.json"), manifest).unwrap();
    fs::write(dir.join(sheet), bytes).unwrap();
}

fn ids(pets: &[PetInfo]) -> Vec<&str> {
    pets.iter().map(|pet| pet.id.as_str()).collect()
}

#[test]
fn lists_valid_pets_and_skips_broken_ones() {
    let (_base, roots) = temp_roots();
    let codex = &roots[1].1;
    let sheet = sheet_webp();
    write_pet(
        codex,
        "chispa",
        r#"{"displayName":"Chispa"}"#,
        "spritesheet.webp",
        &sheet,
    );
    // No displayName: the folder name.
    write_pet(codex, "pixel", "{}", "spritesheet.png", &png(768, 936));
    write_pet(
        codex,
        "fake",
        "{}",
        "spritesheet.webp",
        b"<svg onload=alert(1)>",
    );
    write_pet(codex, "bad-json", "{nope", "spritesheet.webp", &sheet);
    // Only x.webp, named through an escaping path: invalid, and no default sheet either.
    write_pet(
        codex,
        "escape",
        r#"{"spritesheetPath":"..\\chispa\\spritesheet.webp"}"#,
        "x.webp",
        &sheet,
    );
    write_pet(codex, "square", "{}", "spritesheet.png", &png(1536, 1536));
    write_pet(codex, "huge", "{}", "spritesheet.png", &png(6144, 7488));
    fs::create_dir_all(codex.join("empty")).unwrap();

    let pets = list_pets_in(&roots);
    assert_eq!(ids(&pets), ["chispa", "pixel"]);
    assert_eq!(pets[0].display_name, "Chispa");
    assert_eq!(pets[1].display_name, "pixel");
    assert_eq!(pets[1].source, PetSource::Codex);
}

#[test]
fn an_unusable_spritesheet_path_falls_back_to_the_default_names() {
    let (_base, roots) = temp_roots();
    let codex = &roots[1].1;
    write_pet(
        codex,
        "named",
        r#"{"spritesheetPath":"sheet.png"}"#,
        "sheet.png",
        &png(1536, 2288),
    );
    write_pet(
        codex,
        "missing",
        r#"{"spritesheetPath":"gone.webp"}"#,
        "spritesheet.webp",
        &sheet_webp(),
    );
    write_pet(
        codex,
        "bad-name",
        r#"{"spritesheetPath":"../x.webp"}"#,
        "spritesheet.png",
        &png(1536, 1872),
    );
    assert_eq!(ids(&list_pets_in(&roots)), ["bad-name", "missing", "named"]);
    assert!(read_spritesheet_in(&roots, "named")
        .unwrap()
        .starts_with("data:image/png;base64,"));
}

#[test]
fn app_pets_win_over_codex_pets_with_the_same_id_in_any_case() {
    let (_base, roots) = temp_roots();
    write_pet(
        &roots[0].1,
        "Dimo",
        r#"{"displayName":"Mine"}"#,
        "spritesheet.webp",
        &sheet_webp(),
    );
    write_pet(
        &roots[1].1,
        "dimo",
        r#"{"displayName":"Codex"}"#,
        "spritesheet.webp",
        &sheet_webp(),
    );
    let pets = list_pets_in(&roots);
    assert_eq!(pets.len(), 1);
    assert_eq!(
        (pets[0].display_name.as_str(), pets[0].source),
        ("Mine", PetSource::App)
    );
    assert!(read_spritesheet_in(&roots, "Dimo")
        .unwrap()
        .starts_with("data:image/webp;base64,"));
}

#[test]
fn rejects_oversized_sheets() {
    let (_base, roots) = temp_roots();
    let mut big = sheet_webp();
    big.resize(MAX_SHEET_BYTES as usize + 1, 0);
    write_pet(&roots[1].1, "big", "{}", "spritesheet.webp", &big);
    assert!(list_pets_in(&roots).is_empty());
    assert!(read_spritesheet_in(&roots, "big").is_err());
}

#[test]
fn reads_sheets_as_data_urls_by_header_not_extension() {
    let (_base, roots) = temp_roots();
    // A PNG saved as .webp is served as what it is.
    let sheet = png(1536, 1872);
    write_pet(&roots[1].1, "mislabeled", "{}", "spritesheet.webp", &sheet);
    let url = read_spritesheet_in(&roots, "mislabeled").unwrap();
    assert_eq!(
        url,
        format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(&sheet)
        )
    );
}

#[test]
fn ids_cannot_escape_the_pet_roots() {
    let (base, roots) = temp_roots();
    // A pet folder right next to the roots, which only a path escape could reach.
    write_pet(&base, "outside", "{}", "spritesheet.webp", &sheet_webp());
    for id in [
        "../outside",
        "..\\outside",
        "..",
        ".",
        "",
        "C:\\Windows",
        "a/b",
        "outside\0",
        ".hidden",
    ] {
        assert!(!is_valid_id(id), "{id:?} should be rejected");
        assert!(
            read_spritesheet_in(&roots, id).is_err(),
            "{id:?} should not be read"
        );
    }
    assert!(read_spritesheet_in(&roots, "outside").is_err());
    assert!(is_valid_id("dimo-stand") && is_valid_id("hanli_aiesst") && is_valid_id("v1.2"));
}

#[test]
fn a_junction_out_of_the_root_is_refused() {
    let (base, roots) = temp_roots();
    write_pet(
        &base,
        "outside",
        r#"{"displayName":"Outside"}"#,
        "spritesheet.webp",
        &sheet_webp(),
    );
    write_pet(
        &roots[1].1,
        "inside",
        "{}",
        "spritesheet.webp",
        &sheet_webp(),
    );
    let link = roots[1].1.join("linked");
    // A directory junction needs no administrator rights, unlike a symbolic link.
    let status = Command::new("cmd")
        .args(["/c", "mklink", "/J"])
        .arg(&link)
        .arg(base.join("outside"))
        .output()
        .unwrap();
    assert!(status.status.success(), "mklink /J failed: {status:?}");
    assert!(
        link.join("pet.json").is_file(),
        "the junction should lead outside"
    );

    assert_eq!(ids(&list_pets_in(&roots)), ["inside"]);
    assert!(read_spritesheet_in(&roots, "linked").is_err());
    // The same folder is fine when it is a root's own child.
    assert!(read_spritesheet_in(&[(PetSource::Codex, base.clone())], "outside").is_ok());
    fs::remove_dir(&link).unwrap();
}

#[test]
fn sheet_names_stay_in_the_pet_folder() {
    for name in ["spritesheet.webp", "Sheet.PNG"] {
        assert!(is_valid_sheet_name(name), "{name}");
    }
    for name in [
        "../a.webp",
        "..\\a.webp",
        "C:a.webp",
        "sub/a.png",
        "a.svg",
        "a.webp.exe",
        "..",
    ] {
        assert!(!is_valid_sheet_name(name), "{name}");
    }
}

#[test]
fn headers_give_the_image_type_and_size() {
    let header = |mime, width, height| {
        Some(ImageHeader {
            mime,
            width,
            height,
        })
    };
    assert_eq!(
        image_header(&png(1536, 1872)),
        header("image/png", 1536, 1872)
    );
    assert_eq!(
        image_header(&webp_vp8x(1536, 2288)),
        header("image/webp", 1536, 2288)
    );
    assert_eq!(
        image_header(&webp_vp8l(1536, 1872)),
        header("image/webp", 1536, 1872)
    );
    let mut lossy =
        b"RIFF\x00\x00\x00\x00WEBPVP8 \x00\x00\x00\x00\x00\x00\x00\x9d\x01\x2a".to_vec();
    lossy.extend([0x00, 0x06, 0x50, 0x07]); // 1536 × 1872
    assert_eq!(image_header(&lossy), header("image/webp", 1536, 1872));
    assert_eq!(image_header(b"RIFF\x10\x00\x00\x00AVI LIST"), None);
    assert_eq!(image_header(b"GIF89a"), None);
    assert_eq!(image_header(b""), None);
    assert_eq!(
        image_header(&png(1536, 1872)[..20]),
        None,
        "a cut-off header"
    );
}

#[test]
fn only_petdex_grids_up_to_3072_px_wide_count() {
    assert_eq!(sheet_rows(1536, 1872), Some(9));
    assert_eq!(sheet_rows(1536, 2288), Some(11));
    assert_eq!(sheet_rows(768, 936), Some(9));
    assert_eq!(sheet_rows(3072, 3744), Some(9));
    assert_eq!(sheet_rows(6144, 7488), None, "too wide");
    assert_eq!(sheet_rows(1536, 1536), None);
    assert_eq!(sheet_rows(0, 0), None);
}

#[test]
#[ignore = "reads the real ~/.codex/pets of the machine running it"]
fn lists_the_local_codex_pets() {
    let home = windows_home_dir().unwrap();
    let roots = vec![(PetSource::Codex, home.join(".codex").join("pets"))];
    let pets = list_pets_in(&roots);
    println!("{pets:#?}");
    for pet in &pets {
        let url = read_spritesheet_in(&roots, &pet.id).unwrap();
        println!("{} {} KB", pet.id, url.len() / 1024);
    }
    assert!(!pets.is_empty());
}
