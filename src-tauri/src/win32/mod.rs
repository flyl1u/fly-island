//! Safe wrappers around Win32 / COM calls. New `unsafe` code lives only in this
//! module; callers elsewhere use the safe functions it exposes.

pub(crate) mod com;
pub(crate) mod input;
pub(crate) mod ole;
pub(crate) mod process;
pub(crate) mod registry;
pub(crate) mod window;
