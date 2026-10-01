//! Arithmetic modulo the Mersenne prime 2^61 - 1.

pub const P: u64 = (1 << 61) - 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Fp(u64);

impl Fp {
    pub const ZERO: Self = Self(0);
    pub const ONE: Self = Self(1);

    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(reduce64(value))
    }

    #[must_use]
    pub const fn from_i64(value: i64) -> Self {
        let magnitude = Self::new(value.unsigned_abs());
        if value.is_negative() { magnitude.neg() } else { magnitude }
    }

    #[must_use]
    pub const fn value(self) -> u64 {
        self.0
    }

    #[must_use]
    pub const fn add(self, other: Self) -> Self {
        let sum = self.0 + other.0;
        if sum >= P { Self(sum - P) } else { Self(sum) }
    }

    #[must_use]
    pub const fn neg(self) -> Self {
        if self.0 == 0 { self } else { Self(P - self.0) }
    }

    #[must_use]
    pub const fn sub(self, other: Self) -> Self {
        self.add(other.neg())
    }

    #[must_use]
    pub const fn mul(self, other: Self) -> Self {
        let wide = self.0 as u128 * other.0 as u128;
        let folded = (wide & P as u128) + (wide >> 61);
        Self(reduce64(folded as u64))
    }
}

const fn reduce64(value: u64) -> u64 {
    let folded = (value & P) + (value >> 61);
    if folded >= P { folded - P } else { folded }
}
