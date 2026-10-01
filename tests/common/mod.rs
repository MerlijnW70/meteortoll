#![allow(dead_code)]

use meteortoll::check::Seed;

pub type Term = ((usize, usize), i8);

pub struct Builder {
    pub n: (usize, usize, usize),
    pub products: Vec<Vec<u8>>,
}

impl Builder {
    pub fn new(n1: usize, n2: usize, n3: usize) -> Self {
        Self { n: (n1, n2, n3), products: Vec::new() }
    }

    /// `a` names entries `A[i][j]`, `b` names `B[j][k]`, `c` names the outputs `C[i][k]`.
    pub fn product(&mut self, a: &[Term], b: &[Term], c: &[Term]) -> &mut Self {
        let (n1, n2, n3) = self.n;
        let mut bytes = Vec::new();
        factor(&mut bytes, a.iter().map(|&((i, j), x)| (i * n2 + j, x)).collect());
        factor(&mut bytes, b.iter().map(|&((j, k), x)| (j * n3 + k, x)).collect());
        factor(&mut bytes, c.iter().map(|&((i, k), x)| (k * n1 + i, x)).collect());
        self.products.push(bytes);
        self
    }

    pub fn encode(&self) -> Vec<u8> {
        let (n1, n2, n3) = self.n;
        let mut out = vec![n1 as u8, n2 as u8, n3 as u8];
        out.extend_from_slice(&(self.products.len() as u32).to_le_bytes());
        for product in &self.products {
            out.extend_from_slice(product);
        }
        out
    }
}

fn factor(out: &mut Vec<u8>, mut entries: Vec<(usize, i8)>) {
    entries.sort_by_key(|&(index, _)| index);
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    for (index, coef) in entries {
        out.extend_from_slice(&(index as u16).to_le_bytes());
        out.push(coef as u8);
    }
}

pub fn naive(n1: usize, n2: usize, n3: usize) -> Builder {
    let mut scheme = Builder::new(n1, n2, n3);
    for i in 0..n1 {
        for j in 0..n2 {
            for k in 0..n3 {
                scheme.product(&[((i, j), 1)], &[((j, k), 1)], &[((i, k), 1)]);
            }
        }
    }
    scheme
}

pub fn strassen() -> Builder {
    let mut s = Builder::new(2, 2, 2);
    s.product(&[((0, 0), 1), ((1, 1), 1)], &[((0, 0), 1), ((1, 1), 1)], &[((0, 0), 1), ((1, 1), 1)]);
    s.product(&[((1, 0), 1), ((1, 1), 1)], &[((0, 0), 1)], &[((1, 0), 1), ((1, 1), -1)]);
    s.product(&[((0, 0), 1)], &[((0, 1), 1), ((1, 1), -1)], &[((0, 1), 1), ((1, 1), 1)]);
    s.product(&[((1, 1), 1)], &[((1, 0), 1), ((0, 0), -1)], &[((0, 0), 1), ((1, 0), 1)]);
    s.product(&[((0, 0), 1), ((0, 1), 1)], &[((1, 1), 1)], &[((0, 0), -1), ((0, 1), 1)]);
    s.product(&[((1, 0), 1), ((0, 0), -1)], &[((0, 0), 1), ((0, 1), 1)], &[((1, 1), 1)]);
    s.product(&[((0, 1), 1), ((1, 1), -1)], &[((1, 0), 1), ((1, 1), 1)], &[((0, 0), 1)]);
    s
}

pub fn seed(byte: u8) -> Seed {
    let mut bytes = [0u8; 32];
    for (index, slot) in bytes.iter_mut().enumerate() {
        *slot = byte.wrapping_mul(31).wrapping_add(index as u8);
    }
    Seed(bytes)
}

pub fn fixture(name: &str) -> Vec<u8> {
    let path = format!("{}/tests/fixtures/{name}.bin", env!("CARGO_MANIFEST_DIR"));
    std::fs::read(&path).unwrap_or_else(|why| panic!("{path}: {why}"))
}

pub const FIXTURES: [&str; 4] = ["7x7x9_m314_ZT", "2x12x15_m280_ZT", "4x9x8_m208_Z", "9x10x10_m596_ZT"];

/// Byte offsets of every coefficient in an encoded scheme, in order.
pub fn coefficient_offsets(encoded: &[u8]) -> Vec<usize> {
    let rank = u32::from_le_bytes([encoded[3], encoded[4], encoded[5], encoded[6]]);
    let mut at = 7;
    let mut found = Vec::new();
    for _ in 0..rank * 3 {
        let count = u16::from_le_bytes([encoded[at], encoded[at + 1]]) as usize;
        at += 2;
        for entry in 0..count {
            found.push(at + entry * 3 + 2);
        }
        at += count * 3;
    }
    found
}
