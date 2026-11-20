//! Startup begins hidden; either a saved preference or a one-shot timeout reveals the icon.

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) struct Visibility {
    pub(super) visible: bool,
    synced: bool,
}

impl Visibility {
    /// Some is a frontend/user choice; None is the startup timeout. A late choice always wins.
    pub(super) fn next(self, preference: Option<bool>) -> Option<Self> {
        match preference {
            Some(visible) => Some(Self { visible, synced: true }),
            None if !self.synced && !self.visible => Some(Self { visible: true, synced: false }),
            None => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_is_hidden_until_sync_or_timeout() {
        let waiting = Visibility::default();
        assert!(!waiting.visible);
        let fallback = waiting.next(None).unwrap();
        assert!(fallback.visible);
        assert!(fallback.next(None).is_none());
    }

    #[test]
    fn a_frontend_choice_before_timeout_prevents_fallback() {
        for visible in [false, true] {
            let synced = Visibility::default().next(Some(visible)).unwrap();
            assert_eq!(synced.visible, visible);
            assert!(synced.next(None).is_none());
        }
    }

    #[test]
    fn a_late_frontend_choice_overrides_the_visible_fallback() {
        let fallback = Visibility::default().next(None).unwrap();
        let hidden = fallback.next(Some(false)).unwrap();
        assert!(!hidden.visible);
        assert!(hidden.next(None).is_none());
        assert!(hidden.next(Some(true)).unwrap().visible);
    }
}
