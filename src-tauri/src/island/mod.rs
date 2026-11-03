//! Main island window. The rest of the island code in `lib.rs` moves here in
//! refactor-plan step 5.1.

pub(crate) mod top_edge;

#[tauri::command]
pub fn get_island_top_attachment() -> bool {
    top_edge::is_attached()
}
