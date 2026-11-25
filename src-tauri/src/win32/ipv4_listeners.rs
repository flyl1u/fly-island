use std::{mem, net::Ipv4Addr};

use windows::Win32::{
    Foundation::ERROR_INSUFFICIENT_BUFFER,
    NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID,
        TCP_TABLE_OWNER_PID_LISTENER,
    },
};

const AF_INET: u32 = 2;
const MAX_TABLE_BYTES: u32 = 2 * 1024 * 1024;
const WORD_BYTES: usize = mem::size_of::<u32>();
const TABLE_START: usize = mem::offset_of!(MIB_TCPTABLE_OWNER_PID, table) / WORD_BYTES;
const ROW_WORDS: usize = mem::size_of::<MIB_TCPROW_OWNER_PID>() / WORD_BYTES;

fn table() -> Option<Vec<u32>> {
    let mut length = 0;
    // SAFETY: the null table is a size probe; length is a valid writable u32.
    if unsafe {
        GetExtendedTcpTable(
            None,
            &mut length,
            false,
            AF_INET,
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        )
    } != ERROR_INSUFFICIENT_BUFFER.0
    {
        return None;
    }
    for _ in 0..2 {
        if length > MAX_TABLE_BYTES {
            return None;
        }
        let mut words = vec![0u32; (length as usize).div_ceil(WORD_BYTES)];
        // SAFETY: words is aligned writable memory with at least length bytes; the API does not retain the pointer.
        let status = unsafe {
            GetExtendedTcpTable(
                Some(words.as_mut_ptr().cast()),
                &mut length,
                false,
                AF_INET,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if status == 0 {
            words.truncate(length as usize / WORD_BYTES);
            return Some(words);
        }
        if status != ERROR_INSUFFICIENT_BUFFER.0 {
            return None;
        }
    }
    None
}

pub(crate) fn localhost_listener_owner(port: u16) -> Option<u32> {
    const LOCAL_ADDRESS: usize = mem::offset_of!(MIB_TCPROW_OWNER_PID, dwLocalAddr) / WORD_BYTES;
    const LOCAL_PORT: usize = mem::offset_of!(MIB_TCPROW_OWNER_PID, dwLocalPort) / WORD_BYTES;
    const PID: usize = mem::offset_of!(MIB_TCPROW_OWNER_PID, dwOwningPid) / WORD_BYTES;

    let table = table()?;
    let (rows, _) = table.get(TABLE_START..)?.as_chunks::<ROW_WORDS>();
    let count = *table.first()? as usize;
    if count > rows.len() {
        return None;
    }
    let mut owners = rows.iter().take(count).filter_map(|row| {
        let address = Ipv4Addr::from(row[LOCAL_ADDRESS].to_ne_bytes());
        let local_port = u16::from_be(row[LOCAL_PORT] as u16);
        ((address == Ipv4Addr::LOCALHOST || address.is_unspecified()) && local_port == port)
            .then_some(row[PID])
    });
    let owner = owners.next()?;
    (owner != 0 && owners.all(|other| other == owner)).then_some(owner)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_a_real_loopback_listeners_owner_without_connecting() {
        let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        assert_eq!(
            localhost_listener_owner(listener.local_addr().unwrap().port()),
            Some(std::process::id())
        );
        assert_eq!(localhost_listener_owner(0), None);
    }
}
