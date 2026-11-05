//! Fitting the settings window to the screen it opens on, so it is never larger
//! than that screen.

/// A size in logical pixels, like the window config.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Size {
    pub width: f64,
    pub height: f64,
}

/// Room left on each side of a window, so its frame stays clear of the screen
/// edges and the taskbar.
const SCREEN_MARGIN: f64 = 48.0;

/// The wanted size shrunk to fit the screen with a margin, but never below the
/// window's minimum size.
pub(super) fn fit(wanted: Size, min: Size, screen: Size) -> Size {
    let axis =
        |wanted: f64, min: f64, usable: f64| wanted.min(usable - SCREEN_MARGIN * 2.0).max(min);
    Size {
        width: axis(wanted.width, min.width, screen.width),
        height: axis(wanted.height, min.height, screen.height),
    }
}

#[cfg(test)]
mod tests {
    use super::{fit, Size};

    const MIN: Size = Size {
        width: 580.0,
        height: 420.0,
    };
    const WANTED: Size = Size {
        width: 820.0,
        height: 860.0,
    };

    fn size(width: f64, height: f64) -> Size {
        Size { width, height }
    }

    #[test]
    fn keeps_the_configured_size_on_a_large_screen() {
        assert_eq!(fit(WANTED, MIN, size(3840.0, 2112.0)), WANTED);
        assert_eq!(fit(WANTED, MIN, size(1920.0, 1032.0)), WANTED);
    }

    #[test]
    fn shortens_on_a_scaled_laptop_screen() {
        assert_eq!(fit(WANTED, MIN, size(1536.0, 824.0)), size(820.0, 728.0));
    }

    #[test]
    fn shrinks_to_a_small_screen() {
        assert_eq!(fit(WANTED, MIN, size(853.0, 680.0)), size(757.0, 584.0));
    }

    #[test]
    fn never_goes_below_the_minimum_size() {
        assert_eq!(fit(WANTED, MIN, size(600.0, 400.0)), MIN);
    }
}
