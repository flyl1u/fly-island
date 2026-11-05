//! How big a new settings window is: a share of the screen it opens on, so it suits
//! a 1080p laptop and a 4K monitor alike, and never larger than that screen.

/// A size in logical pixels, like the window config.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Size {
    pub width: f64,
    pub height: f64,
}

/// The share of the screen's work area a first window takes. Tuned on a 4K screen at
/// 100% scale, where about 1510×1330 felt right.
const WIDTH_SHARE: f64 = 0.40;
const HEIGHT_SHARE: f64 = 0.63;
/// Below this the pages get cramped; above it they only add empty space.
const SMALLEST_DEFAULT: Size = Size {
    width: 820.0,
    height: 640.0,
};
const LARGEST_DEFAULT: Size = Size {
    width: 1520.0,
    height: 1340.0,
};

/// Room left on each side of a window, so its frame stays clear of the screen
/// edges and the taskbar.
const SCREEN_MARGIN: f64 = 48.0;

/// The size of a window opened for the first time on a screen with this work area.
pub(super) fn default_size(screen: Size) -> Size {
    Size {
        width: (screen.width * WIDTH_SHARE).clamp(SMALLEST_DEFAULT.width, LARGEST_DEFAULT.width),
        height: (screen.height * HEIGHT_SHARE)
            .clamp(SMALLEST_DEFAULT.height, LARGEST_DEFAULT.height),
    }
}

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
    use super::{default_size, fit, Size};

    const MIN: Size = Size {
        width: 580.0,
        height: 420.0,
    };

    fn size(width: f64, height: f64) -> Size {
        Size { width, height }
    }

    fn first_window(screen: Size) -> Size {
        fit(default_size(screen), MIN, screen)
    }

    #[test]
    fn a_4k_screen_at_100_percent_gets_the_largest_default() {
        let opened = first_window(size(3840.0, 2112.0));
        assert_eq!(opened.width, 1520.0);
        assert!((opened.height - 1330.56).abs() < 0.01);
    }

    #[test]
    fn a_2k_screen_gets_a_share_of_it() {
        let opened = first_window(size(2560.0, 1392.0));
        assert_eq!(opened.width, 1024.0);
        assert!((opened.height - 876.96).abs() < 0.01);
    }

    #[test]
    fn a_1080p_screen_gets_the_smallest_default() {
        assert_eq!(first_window(size(1920.0, 1032.0)).width, 820.0);
        assert_eq!(first_window(size(1536.0, 824.0)), size(820.0, 640.0));
    }

    #[test]
    fn a_saved_size_shrinks_to_a_smaller_screen() {
        assert_eq!(
            fit(size(1511.0, 1334.0), MIN, size(1920.0, 1032.0)),
            size(1511.0, 936.0)
        );
        assert_eq!(
            fit(size(1511.0, 1334.0), MIN, size(1280.0, 680.0)),
            size(1184.0, 584.0)
        );
    }

    #[test]
    fn never_goes_below_the_minimum_size() {
        assert_eq!(fit(size(820.0, 640.0), MIN, size(600.0, 400.0)), MIN);
    }
}
