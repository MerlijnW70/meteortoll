//! Sparse byte encoding of a matrix multiplication scheme.
//!
//! Layout, little endian:
//! `n1 u8, n2 u8, n3 u8, rank u32`, then for each product the three factors `u`, `v`, `w`,
//! each written as `count u16` followed by `count` entries of `index u16, coef i8`.
//! `u` indexes `A[i][j]` as `i * n2 + j`, `v` indexes `B[j][k]` as `j * n3 + k`, and `w`
//! indexes the transposed output `C[i][k]` as `k * n1 + i`, the convention `fmm` writes.
//! Indices within a factor are strictly increasing and no coefficient is zero, so every
//! scheme has exactly one encoding.

pub const HEADER_LEN: usize = 7;
pub const ENTRY_LEN: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Truncated,
    EmptyDimension,
    ZeroRank,
    IndexOutOfRange,
    IndexNotIncreasing,
    ZeroCoefficient,
    TrailingBytes,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Header {
    pub n1: u8,
    pub n2: u8,
    pub n3: u8,
    pub rank: u32,
}

impl Header {
    pub fn parse(bytes: &[u8]) -> Result<Self, Error> {
        let head = bytes.get(..HEADER_LEN).ok_or(Error::Truncated)?;
        let header = Self {
            n1: head[0],
            n2: head[1],
            n3: head[2],
            rank: u32::from_le_bytes([head[3], head[4], head[5], head[6]]),
        };
        if header.n1 == 0 || header.n2 == 0 || header.n3 == 0 {
            return Err(Error::EmptyDimension);
        }
        if header.rank == 0 {
            return Err(Error::ZeroRank);
        }
        Ok(header)
    }

    #[must_use]
    pub const fn len_u(&self) -> u32 {
        self.n1 as u32 * self.n2 as u32
    }

    #[must_use]
    pub const fn len_v(&self) -> u32 {
        self.n2 as u32 * self.n3 as u32
    }

    #[must_use]
    pub const fn len_w(&self) -> u32 {
        self.n3 as u32 * self.n1 as u32
    }

    #[must_use]
    pub const fn triples(&self) -> u32 {
        self.n1 as u32 * self.n2 as u32 * self.n3 as u32
    }
}

/// One factor of one product, read in place.
#[derive(Debug, Clone, Copy)]
pub struct Factor<'a> {
    entries: &'a [u8],
}

impl<'a> Factor<'a> {
    /// Reads the factor at `at`, checks it against `len`, and returns it with the offset
    /// just past it.
    pub fn read(bytes: &'a [u8], at: usize, len: u32) -> Result<(Self, usize), Error> {
        let count = bytes.get(at..at + 2).ok_or(Error::Truncated)?;
        let count = u16::from_le_bytes([count[0], count[1]]) as usize;
        let start = at + 2;
        let end = start + count * ENTRY_LEN;
        let entries = bytes.get(start..end).ok_or(Error::Truncated)?;
        let factor = Self { entries };
        let mut previous: Option<u16> = None;
        for (index, coef) in factor.iter() {
            if u32::from(index) >= len {
                return Err(Error::IndexOutOfRange);
            }
            if previous.is_some_and(|last| index <= last) {
                return Err(Error::IndexNotIncreasing);
            }
            if coef == 0 {
                return Err(Error::ZeroCoefficient);
            }
            previous = Some(index);
        }
        Ok((factor, end))
    }

    pub fn iter(&self) -> impl Iterator<Item = (u16, i8)> + 'a {
        self.entries
            .as_chunks::<ENTRY_LEN>()
            .0
            .iter()
            .map(|entry| (u16::from_le_bytes([entry[0], entry[1]]), entry[2] as i8))
    }

    #[must_use]
    pub const fn count(&self) -> usize {
        self.entries.len() / ENTRY_LEN
    }
}
