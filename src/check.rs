//! Resumable randomized check that an encoded scheme computes the matrix product.
//!
//! With `A`, `B` and `G` drawn from the seed, a correct scheme satisfies
//! `sum_r (u_r . A)(v_r . B)(w_r . G) == sum_{i,j,k} A[i][j] B[j][k] G[k][i]` in the field.
//! Coefficients are bounded by the `i8` encoding, so for any rank that fits a `u32` every
//! coefficient of the exact difference polynomial is smaller than the modulus. A wrong
//! scheme therefore leaves a nonzero polynomial of degree three, which vanishes at the
//! drawn point with probability at most `3 / P` (Schwartz-Zippel). The seed must not be
//! knowable when the scheme is fixed.

use crate::field::Fp;
use crate::scheme::{Error, Factor, HEADER_LEN, Header};

pub const STATE_LEN: usize = 47;

pub const TAG_A: u64 = 1;
pub const TAG_B: u64 = 2;
pub const TAG_G: u64 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Seed(pub [u8; 32]);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Draw {
    key: u64,
}

impl Draw {
    fn new(seed: &Seed) -> Self {
        let mut key = 0u64;
        for word in seed.0.as_chunks::<8>().0 {
            key = mix(key ^ u64::from_le_bytes(*word));
        }
        Self { key }
    }

    fn at(self, tag: u64, index: u32) -> Fp {
        Fp::new(mix(self.key ^ (tag << 32 | u64::from(index))))
    }
}

/// The coordinate the check uses for entry `index` of `A` (`TAG_A`), `B` (`TAG_B`) or `G`
/// (`TAG_G`), so a client can reproduce the point a seed selects.
#[must_use]
pub fn draw(seed: &Seed, tag: u64, index: u32) -> Fp {
    Draw::new(seed).at(tag, index)
}

const fn mix(value: u64) -> u64 {
    let mut z = value.wrapping_add(0x9e37_79b9_7f4a_7c15);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Running,
    Holds,
    Fails,
}

/// Verification state. It is plain data so a program can keep it in an account between
/// transactions; every call must be given the same encoded bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Check {
    header: Header,
    draw: Draw,
    offset: usize,
    products: u32,
    triples: u32,
    lhs: Fp,
    rhs: Fp,
}

impl Check {
    pub fn start(encoded: &[u8], seed: &Seed) -> Result<Self, Error> {
        Ok(Self {
            header: Header::parse(encoded)?,
            draw: Draw::new(seed),
            offset: HEADER_LEN,
            products: 0,
            triples: 0,
            lhs: Fp::ZERO,
            rhs: Fp::ZERO,
        })
    }

    #[must_use]
    pub const fn header(&self) -> Header {
        self.header
    }

    /// Products of the scheme folded in so far.
    #[must_use]
    pub const fn products(&self) -> u32 {
        self.products
    }

    /// Triples of the direct product folded in so far.
    #[must_use]
    pub const fn triples(&self) -> u32 {
        self.triples
    }

    /// The scheme side of the identity, as far as it has run.
    #[must_use]
    pub const fn lhs(&self) -> Fp {
        self.lhs
    }

    /// The direct-product side of the identity, as far as it has run.
    #[must_use]
    pub const fn rhs(&self) -> Fp {
        self.rhs
    }

    /// Fixed-width little-endian form, for keeping the state in an account.
    #[must_use]
    pub fn save(&self) -> [u8; STATE_LEN] {
        let mut out = [0u8; STATE_LEN];
        out[0] = self.header.n1;
        out[1] = self.header.n2;
        out[2] = self.header.n3;
        out[3..7].copy_from_slice(&self.header.rank.to_le_bytes());
        out[7..15].copy_from_slice(&self.draw.key.to_le_bytes());
        out[15..23].copy_from_slice(&(self.offset as u64).to_le_bytes());
        out[23..27].copy_from_slice(&self.products.to_le_bytes());
        out[27..31].copy_from_slice(&self.triples.to_le_bytes());
        out[31..39].copy_from_slice(&self.lhs.value().to_le_bytes());
        out[39..47].copy_from_slice(&self.rhs.value().to_le_bytes());
        out
    }

    pub fn restore(saved: &[u8; STATE_LEN]) -> Result<Self, Error> {
        let word = |at: usize| {
            let mut eight = [0u8; 8];
            eight.copy_from_slice(&saved[at..at + 8]);
            u64::from_le_bytes(eight)
        };
        let half = |at: usize| u32::from_le_bytes([saved[at], saved[at + 1], saved[at + 2], saved[at + 3]]);
        Ok(Self {
            header: Header::parse(&saved[..HEADER_LEN])?,
            draw: Draw { key: word(7) },
            offset: usize::try_from(word(15)).map_err(|_| Error::Truncated)?,
            products: half(23),
            triples: half(27),
            lhs: Fp::new(word(31)),
            rhs: Fp::new(word(39)),
        })
    }

    /// Advances by about `budget` units of work, where one unit is one stored coefficient
    /// or one `(i, j, k)` triple of the direct product. Every call makes progress: it
    /// finishes at least one product, or one triple once the products are done.
    pub fn run(&mut self, encoded: &[u8], budget: u32) -> Result<Verdict, Error> {
        let mut left = budget.max(1);
        let first = self.products;
        while self.products < self.header.rank {
            let (u, after_u) = Factor::read(encoded, self.offset, self.header.len_u())?;
            let (v, after_v) = Factor::read(encoded, after_u, self.header.len_v())?;
            let (w, after_w) = Factor::read(encoded, after_v, self.header.len_w())?;
            let cost = (u.count() + v.count() + w.count()).max(1) as u32;
            if self.products > first && cost > left {
                return Ok(Verdict::Running);
            }
            left = left.saturating_sub(cost);
            let product = self
                .dot(u, TAG_A)
                .mul(self.dot(v, TAG_B))
                .mul(self.dot(w, TAG_G));
            self.lhs = self.lhs.add(product);
            self.offset = after_w;
            self.products += 1;
        }
        if self.offset != encoded.len() {
            return Err(Error::TrailingBytes);
        }
        let (n1, n2, n3) = (
            u32::from(self.header.n1),
            u32::from(self.header.n2),
            u32::from(self.header.n3),
        );
        while self.triples < self.header.triples() {
            if left == 0 {
                return Ok(Verdict::Running);
            }
            left -= 1;
            let t = self.triples;
            let (i, j, k) = (t / (n2 * n3), t / n3 % n2, t % n3);
            let term = self
                .draw
                .at(TAG_A, i * n2 + j)
                .mul(self.draw.at(TAG_B, j * n3 + k))
                .mul(self.draw.at(TAG_G, k * n1 + i));
            self.rhs = self.rhs.add(term);
            self.triples += 1;
        }
        Ok(if self.lhs == self.rhs { Verdict::Holds } else { Verdict::Fails })
    }

    fn dot(&self, factor: Factor<'_>, tag: u64) -> Fp {
        factor.iter().fold(Fp::ZERO, |sum, (index, coef)| {
            sum.add(Fp::from_i64(i64::from(coef)).mul(self.draw.at(tag, u32::from(index))))
        })
    }
}

/// Runs a whole check in one call.
pub fn verify(encoded: &[u8], seed: &Seed) -> Result<Verdict, Error> {
    let mut check = Check::start(encoded, seed)?;
    check.run(encoded, u32::MAX)
}
