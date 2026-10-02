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

    /// The product with 64-bit operations only: Solana's virtual machine has no 128-bit
    /// multiply, and the compiler's wide helper costs several times this. With
    /// `a = a1 2^32 + a0`, `b = b1 2^32 + b0` (so `a1, b1 < 2^29`) and `2^61 = 1` mod `P`:
    /// `a1 b1 2^64 = 8 a1 b1`, below `2^61`; the middle term `m 2^32` with `m < 2^62` splits as
    /// `m = mh 2^29 + ml` into `mh + ml 2^32`; and `a0 b0 < 2^64` folds once. The three parts sum
    /// below `2^63`, so one more fold and at most one subtraction reduce it.
    #[must_use]
    pub const fn mul(self, other: Self) -> Self {
        const LOW_32: u64 = (1 << 32) - 1;
        const LOW_29: u64 = (1 << 29) - 1;
        let (a1, a0) = (self.0 >> 32, self.0 & LOW_32);
        let (b1, b0) = (other.0 >> 32, other.0 & LOW_32);
        let high = (a1 * b1) << 3;
        let middle = a1 * b0 + a0 * b1;
        let middle = (middle >> 29) + ((middle & LOW_29) << 32);
        let low = a0 * b0;
        let low = (low & P) + (low >> 61);
        Self(reduce64(high + middle + low))
    }
}

const fn reduce64(value: u64) -> u64 {
    let folded = (value & P) + (value >> 61);
    if folded >= P { folded - P } else { folded }
}
