//! Resumable randomized check that an encoded scheme computes the matrix product.
//!
//! The seed fixes three field elements `r1`, `r2`, `r3`, and every matrix entry gets a power of
//! one of them as its value: `A[x] = r1^x`, `B[y] = r2^y`, `G[z] = r3^z`, with `x`, `y`, `z`
//! the entry indices of the encoding. A scheme is correct iff, as a polynomial identity in the
//! entries, `sum_r (u_r . A)(v_r . B)(w_r . G) == sum_{i,j,k} A[i][j] B[j][k] G[k][i]`.
//!
//! The substitution sends distinct monomials `A[x] B[y] G[z]` to distinct monomials
//! `r1^x r2^y r3^z`, so a wrong scheme leaves a nonzero polynomial in `r1, r2, r3`. Its integer
//! coefficients are sums of at most `rank` products of three `i8` coefficients, below
//! `2^32 * 2^21 < P / 2` in size, so it stays nonzero modulo `P`. Its degree is below
//! `n1*n2 + n2*n3 + n3*n1`, so by Schwartz-Zippel it vanishes at a uniformly random point with
//! probability at most `(n1*n2 + n2*n3 + n3*n1) / P` ([`error_bound`]). The seed must not be
//! knowable when the scheme is fixed.
//!
//! The direct side factors into three geometric sums, so it costs `n1 + n2 + n3` steps, not
//! `n1 * n2 * n3`.

use crate::field::{Fp, P};
use crate::scheme::{Error, Factor, HEADER_LEN, Header};

pub const STATE_LEN: usize = 60;

/// Most coefficients one product may store. The check folds in whole products, so one product
/// must fit one call: a call does at most the larger of its budget and one product, and the
/// program's budget is above this. The densest product of any scheme in the known records stores
/// a few dozen. A heavier product is refused as malformed before its entries are scanned.
pub const MAX_PRODUCT_COST: u32 = 4_096;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Seed(pub [u8; 32]);

/// The random point: `r1`, `r2`, `r3` from the first 24 bytes of the seed.
#[must_use]
pub fn point(seed: &Seed) -> [Fp; 3] {
    let word = |at: usize| {
        let mut eight = [0u8; 8];
        eight.copy_from_slice(&seed.0[at..at + 8]);
        Fp::new(u64::from_le_bytes(eight))
    };
    [word(0), word(8), word(16)]
}

/// The value the check gives entry `index` of `A` (`which` 0), `B` (1) or `G` (2), so a client
/// can reproduce the point a seed selects.
#[must_use]
pub fn coordinate(seed: &Seed, which: usize, index: u16) -> Fp {
    Powers::new(point(seed)[which]).pow(index)
}

/// Bound on a wrong scheme passing for a shape, as a numerator over `P`: the degree bound
/// `n1*n2 + n2*n3 + n3*n1`.
#[must_use]
pub fn error_bound(header: &Header) -> u64 {
    u64::from(header.len_u()) + u64::from(header.len_v()) + u64::from(header.len_w())
}

/// Powers of one coordinate, `r^(d * 16^k)` for each 4-bit digit `d` at position `k` of a
/// 16-bit exponent: three products give any power.
struct Powers([[Fp; 16]; 4]);

impl Powers {
    fn new(r: Fp) -> Self {
        let mut table = [[Fp::ONE; 16]; 4];
        let mut base = r;
        for row in &mut table {
            for digit in 1..16 {
                row[digit] = row[digit - 1].mul(base);
            }
            base = row[15].mul(base);
        }
        Self(table)
    }

    fn pow(&self, exponent: u16) -> Fp {
        let e = usize::from(exponent);
        self.0[0][e & 15].mul(self.0[1][(e >> 4) & 15]).mul(self.0[2][(e >> 8) & 15]).mul(self.0[3][e >> 12])
    }
}

/// `sum_{e < n} t^e`.
fn geometric(t: Fp, n: u32) -> Fp {
    let (mut sum, mut term) = (Fp::ZERO, Fp::ONE);
    for _ in 0..n {
        sum = sum.add(term);
        term = term.mul(t);
    }
    sum
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
    point: [Fp; 3],
    offset: usize,
    products: u32,
    lhs: Fp,
    rhs: Fp,
    direct: bool,
}

impl Check {
    pub fn start(encoded: &[u8], seed: &Seed) -> Result<Self, Error> {
        Ok(Self {
            header: Header::parse(encoded)?,
            point: point(seed),
            offset: HEADER_LEN,
            products: 0,
            lhs: Fp::ZERO,
            rhs: Fp::ZERO,
            direct: false,
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

    /// Whether the direct side has been computed.
    #[must_use]
    pub const fn direct(&self) -> bool {
        self.direct
    }

    /// The scheme side of the identity, as far as it has run.
    #[must_use]
    pub const fn lhs(&self) -> Fp {
        self.lhs
    }

    /// The direct-product side of the identity, once computed.
    #[must_use]
    pub const fn rhs(&self) -> Fp {
        self.rhs
    }

    /// Fixed-width little-endian form, for keeping the state in an account:
    /// header 0..7, `r1 r2 r3` 7..31, byte offset 31..39, products 39..43, lhs 43..51,
    /// rhs 51..59, direct side done 59.
    #[must_use]
    pub fn save(&self) -> [u8; STATE_LEN] {
        let mut out = [0u8; STATE_LEN];
        out[0] = self.header.n1;
        out[1] = self.header.n2;
        out[2] = self.header.n3;
        out[3..7].copy_from_slice(&self.header.rank.to_le_bytes());
        for (index, r) in self.point.iter().enumerate() {
            out[7 + 8 * index..15 + 8 * index].copy_from_slice(&r.value().to_le_bytes());
        }
        out[31..39].copy_from_slice(&(self.offset as u64).to_le_bytes());
        out[39..43].copy_from_slice(&self.products.to_le_bytes());
        out[43..51].copy_from_slice(&self.lhs.value().to_le_bytes());
        out[51..59].copy_from_slice(&self.rhs.value().to_le_bytes());
        out[59] = u8::from(self.direct);
        out
    }

    pub fn restore(saved: &[u8; STATE_LEN]) -> Result<Self, Error> {
        let word = |at: usize| {
            let mut eight = [0u8; 8];
            eight.copy_from_slice(&saved[at..at + 8]);
            u64::from_le_bytes(eight)
        };
        // Field elements are kept reduced; anything else is not a state this code saved.
        let element = |at: usize| {
            let value = word(at);
            if value < P { Ok(Fp::new(value)) } else { Err(Error::Truncated) }
        };
        Ok(Self {
            header: Header::parse(&saved[..HEADER_LEN])?,
            point: [element(7)?, element(15)?, element(23)?],
            offset: usize::try_from(word(31)).map_err(|_| Error::Truncated)?,
            products: u32::from_le_bytes([saved[39], saved[40], saved[41], saved[42]]),
            lhs: element(43)?,
            rhs: element(51)?,
            direct: match saved[59] {
                0 => false,
                1 => true,
                _ => return Err(Error::Truncated),
            },
        })
    }

    /// Advances by about `budget` units of work, one unit per stored coefficient. Every call
    /// makes progress: it folds in at least one product, or finishes with the direct side,
    /// which costs `n1 + n2 + n3` steps and runs in the call that folds in the last product.
    pub fn run(&mut self, encoded: &[u8], budget: u32) -> Result<Verdict, Error> {
        let powers = [Powers::new(self.point[0]), Powers::new(self.point[1]), Powers::new(self.point[2])];
        let mut left = budget.max(1);
        let first = self.products;
        while self.products < self.header.rank {
            let limit = MAX_PRODUCT_COST as usize;
            let (u, after_u) = Factor::read_within(encoded, self.offset, self.header.len_u(), limit)?;
            let (v, after_v) = Factor::read_within(encoded, after_u, self.header.len_v(), limit - u.count())?;
            let (w, after_w) = Factor::read_within(encoded, after_v, self.header.len_w(), limit - u.count() - v.count())?;
            let cost = (u.count() + v.count() + w.count()).max(1) as u32;
            if self.products > first && cost > left {
                return Ok(Verdict::Running);
            }
            left = left.saturating_sub(cost);
            let product = dot(u, &powers[0]).mul(dot(v, &powers[1])).mul(dot(w, &powers[2]));
            self.lhs = self.lhs.add(product);
            self.offset = after_w;
            self.products += 1;
        }
        if self.offset != encoded.len() {
            return Err(Error::TrailingBytes);
        }
        // Cheap and idempotent: n1 + n2 + n3 steps, the same value however often it runs.
        self.rhs = self.direct_side(&powers);
        self.direct = true;
        Ok(if self.lhs == self.rhs { Verdict::Holds } else { Verdict::Fails })
    }

    /// `sum_{i,j,k} r1^(i n2 + j) r2^(j n3 + k) r3^(k n1 + i)`, which factors as
    /// `(sum_i x^i)(sum_j y^j)(sum_k z^k)` with `x = r1^n2 r3`, `y = r1 r2^n3`, `z = r2 r3^n1`.
    fn direct_side(&self, powers: &[Powers; 3]) -> Fp {
        let (n1, n2, n3) = (self.header.n1, self.header.n2, self.header.n3);
        let [r1, r2, r3] = self.point;
        let x = powers[0].pow(u16::from(n2)).mul(r3);
        let y = r1.mul(powers[1].pow(u16::from(n3)));
        let z = r2.mul(powers[2].pow(u16::from(n1)));
        geometric(x, u32::from(n1)).mul(geometric(y, u32::from(n2))).mul(geometric(z, u32::from(n3)))
    }
}

/// `sum coef * r^index` over a factor. Nearly every coefficient in practice is 1 or -1, which
/// need an addition, not a multiplication.
fn dot(factor: Factor<'_>, powers: &Powers) -> Fp {
    factor.iter().fold(Fp::ZERO, |sum, (index, coef)| {
        let value = powers.pow(index);
        match coef {
            1 => sum.add(value),
            -1 => sum.sub(value),
            _ => sum.add(Fp::from_i64(i64::from(coef)).mul(value)),
        }
    })
}

/// Runs a whole check in one call.
pub fn verify(encoded: &[u8], seed: &Seed) -> Result<Verdict, Error> {
    let mut check = Check::start(encoded, seed)?;
    check.run(encoded, u32::MAX)
}
