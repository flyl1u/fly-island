use super::ClipboardHistoryItem;
use std::collections::HashSet;

/// Explicit selection includes favorites; unknown and duplicate ids are harmless.
pub(super) fn take_selected(
    items: &mut Vec<ClipboardHistoryItem>,
    ids: &[String],
) -> Vec<ClipboardHistoryItem> {
    let ids: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let mut removed = Vec::new();
    let mut kept = Vec::with_capacity(items.len());
    for item in std::mem::take(items) {
        if ids.contains(item.id.as_str()) {
            removed.push(item);
        } else {
            kept.push(item);
        }
    }
    *items = kept;
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard_history::ClipboardHistoryItemKind;

    fn item(id: &str, favorite: bool) -> ClipboardHistoryItem {
        ClipboardHistoryItem {
            id: id.into(),
            kind: ClipboardHistoryItemKind::Text,
            hash: id.into(),
            created_at: 0,
            copied_at: 0,
            favorite,
            note: String::new(),
            preview: id.into(),
            text: Some(id.into()),
            image: None,
        }
    }

    #[test]
    fn removes_exact_selection_including_favorites_once_and_keeps_order() {
        let mut items = vec![item("a", false), item("b", true), item("c", false)];
        let removed = take_selected(&mut items, &["b".into(), "missing".into(), "b".into()]);
        assert_eq!(removed.len(), 1);
        assert!(removed[0].favorite);
        assert_eq!(
            items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "c"]
        );
        assert!(take_selected(&mut items, &[]).is_empty());
        assert_eq!(
            take_selected(&mut items, &["a".into(), "c".into()]).len(),
            2
        );
        assert!(items.is_empty());
    }
}
