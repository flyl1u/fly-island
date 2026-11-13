pub(super) struct Asset {
    pub name: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub size: u64,
}
pub(super) const X64: Asset = Asset {
    name: "BetterNCMII.dll",
    url: "https://github.com/std-microblock/chromatic/releases/download/1.3.4/BetterNCMII.dll",
    sha256: "a7c77af418d7940e63faa58ea036fba1f4baad497947109ea52ed78c8e86608f", size: 1204224,
};
pub(super) const X86: Asset = Asset {
    name: "BetterNCMII86.dll",
    url: "https://github.com/std-microblock/chromatic/releases/download/1.3.4/BetterNCMII86.dll",
    sha256: "b7be606f353c5ca36235ff1f4dfccde62dc459a4b07a506698d663a1953864f2", size: 912896,
};
pub(super) const PLUGIN: Asset = Asset {
    name: "InfLink-rs.plugin",
    url: "https://github.com/apoint123/inflink-rs/releases/download/v3.4.0/InfLink-rs.plugin",
    sha256: "7d0b7b863b072a99b88eb614c788099315e690920889aaca22685d3663661468", size: 1637976,
};
pub(super) fn loader_hash(hash: &str) -> bool { hash == X64.sha256 || hash == X86.sha256 }
