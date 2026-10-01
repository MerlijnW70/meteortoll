use anchor_lang::prelude::*;

use crate::constants::MAX_SCHEME_LEN;
use crate::error::TollError;

pub const MAGIC: [u8; 8] = *b"TOLLSUB1";
pub const HEADER_LEN: usize = 8 + 32 + 4;

pub fn open(data: &mut [u8], attempt: &Pubkey, len: u32) -> Result<()> {
    require!(len > 0 && len <= MAX_SCHEME_LEN, TollError::BadSubmission);
    require!(data.len() >= HEADER_LEN + len as usize, TollError::BadSubmission);
    require!(data[..HEADER_LEN].iter().all(|b| *b == 0), TollError::BadSubmission);
    data[..8].copy_from_slice(&MAGIC);
    data[8..40].copy_from_slice(attempt.as_ref());
    data[40..44].copy_from_slice(&len.to_le_bytes());
    Ok(())
}

pub fn scheme<'a>(data: &'a [u8], attempt: &Pubkey) -> Result<&'a [u8]> {
    require!(data.len() >= HEADER_LEN, TollError::BadSubmission);
    require!(data[..8] == MAGIC, TollError::BadSubmission);
    require!(data[8..40] == *attempt.as_ref(), TollError::BadSubmission);
    let len = u32::from_le_bytes([data[40], data[41], data[42], data[43]]) as usize;
    data.get(HEADER_LEN..HEADER_LEN + len)
        .ok_or_else(|| error!(TollError::BadSubmission))
}

pub fn write(data: &mut [u8], attempt: &Pubkey, offset: u32, bytes: &[u8]) -> Result<()> {
    let len = scheme(data, attempt)?.len();
    let start = offset as usize;
    let end = start.checked_add(bytes.len()).ok_or_else(|| error!(TollError::OutOfBounds))?;
    require!(end <= len, TollError::OutOfBounds);
    data[HEADER_LEN + start..HEADER_LEN + end].copy_from_slice(bytes);
    Ok(())
}
