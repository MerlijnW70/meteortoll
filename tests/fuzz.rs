mod common;

use common::{FIXTURES, coefficient_offsets, fixture, naive, strassen};
use meteortoll::check::{Check, STATE_LEN, Seed, Verdict, verify};
use meteortoll::scheme::HEADER_LEN;

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }

    fn byte(&mut self) -> u8 {
        self.next() as u8
    }

    fn seed(&mut self) -> Seed {
        let mut out = [0u8; 32];
        for b in &mut out {
            *b = self.byte();
        }
        Seed(out)
    }

    fn budget(&mut self) -> u32 {
        [0, 1, 2, 7, 100, 2_000, 5_000, u32::MAX][self.below(8)]
    }
}

fn stepped(encoded: &[u8], seed: &Seed, budget: u32) -> Result<Verdict, meteortoll::scheme::Error> {
    let mut check = Check::start(encoded, seed)?;
    let limit = u64::from(check.header().rank) + 2;
    for _ in 0..limit {
        let before = check.products();
        let verdict = check.run(encoded, budget)?;
        let restored = Check::restore(&check.save()).expect("a saved state restores");
        assert_eq!(restored, check);
        if verdict != Verdict::Running {
            return Ok(verdict);
        }
        assert!(check.products() > before, "a call made no progress");
        check = restored;
    }
    panic!("the check did not finish within rank + 2 calls");
}

fn exercise(encoded: &[u8], rng: &mut Rng) {
    let seed = rng.seed();
    let whole = verify(encoded, &seed);
    let budget = rng.budget();
    assert_eq!(stepped(encoded, &seed, budget), whole, "budget {budget} changed the verdict");
}

fn mutate(base: &[u8], rng: &mut Rng) -> Vec<u8> {
    let mut out = base.to_vec();
    match rng.below(7) {
        0 => {
            for _ in 0..=rng.below(8) {
                if !out.is_empty() {
                    let at = rng.below(out.len());
                    out[at] ^= 1 << rng.below(8);
                }
            }
        }
        1 => {
            if !out.is_empty() {
                let at = rng.below(out.len());
                out[at] = [0x00, 0xFF, 0x80, 0x7F, 0x01][rng.below(5)];
            }
        }
        2 => out.truncate(rng.below(out.len() + 1)),
        3 => {
            for _ in 0..=rng.below(64) {
                out.push(rng.byte());
            }
        }
        4 => {
            if out.len() >= HEADER_LEN {
                let at = rng.below(HEADER_LEN);
                out[at] = rng.byte();
            }
        }
        5 => {
            if out.len() >= HEADER_LEN {
                out[3..7].copy_from_slice(&[u32::MAX, 0, 1, rng.next() as u32][rng.below(4)].to_le_bytes());
            }
        }
        _ => {
            if out.len() > HEADER_LEN + 2 {
                let at = HEADER_LEN + rng.below(out.len() - HEADER_LEN - 1);
                let take = out[at];
                out.insert(at, take);
            }
        }
    }
    out
}

fn reshape(base: &[u8], rng: &mut Rng) -> Vec<u8> {
    let mut out = base.to_vec();
    let coefficients = coefficient_offsets(base);
    for _ in 0..=rng.below(4) {
        let at = coefficients[rng.below(coefficients.len())];
        match rng.below(3) {
            0 => out[at] = (out[at] as i8).wrapping_neg() as u8,
            1 => out[at] = [1, 0xFF, 0x80, 0x7F, 2][rng.below(5)],
            _ => out[at] = rng.byte().max(1),
        }
    }
    out
}

#[test]
fn reshaped_records() {
    let mut rng = Rng(0x2545_F491_4F6C_DD1D);
    let mut bases: Vec<Vec<u8>> = FIXTURES.iter().map(|name| fixture(name)).collect();
    bases.push(strassen().encode());
    bases.push(naive(3, 3, 3).encode());
    let mut held = 0;
    for round in 0..2_000 {
        let base = &bases[round % bases.len()];
        let scheme = if round % 10 == 0 { base.clone() } else { reshape(base, &mut rng) };
        let seed = rng.seed();
        let whole = verify(&scheme, &seed);
        assert!(matches!(whole, Ok(Verdict::Holds | Verdict::Fails)), "a reshaped record must reach a verdict: {whole:?}");
        held += usize::from(whole == Ok(Verdict::Holds));
        assert_eq!(stepped(&scheme, &seed, rng.budget()), whole);
    }
    assert!((200..2_000).contains(&held));
}

#[test]
fn mutated_records() {
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut bases: Vec<Vec<u8>> = FIXTURES.iter().map(|name| fixture(name)).collect();
    bases.push(strassen().encode());
    bases.push(naive(2, 3, 4).encode());
    for round in 0..600 {
        let base = &bases[round % bases.len()];
        let mutated = mutate(base, &mut rng);
        exercise(&mutated, &mut rng);
    }
}

#[test]
fn mutated_small() {
    let mut rng = Rng(0xD1B5_4A32_D192_ED03);
    let bases = [strassen().encode(), naive(2, 2, 2).encode(), naive(1, 3, 2).encode(), naive(3, 2, 2).encode()];
    for round in 0..20_000 {
        let mut scheme = bases[round % bases.len()].clone();
        for _ in 0..=rng.below(3) {
            scheme = mutate(&scheme, &mut rng);
        }
        exercise(&scheme, &mut rng);
    }
}

#[test]
fn random_bytes() {
    let mut rng = Rng(0xA076_1D64_78BD_642F);
    for _ in 0..20_000 {
        let len = rng.below(400);
        let bytes: Vec<u8> = (0..len).map(|_| rng.byte()).collect();
        exercise(&bytes, &mut rng);
    }
}

#[test]
fn random_states() {
    let mut rng = Rng(0xE703_7ED1_A0B4_28DB);
    let schemes = [strassen().encode(), naive(2, 3, 4).encode(), Vec::new()];
    for round in 0..20_000 {
        let mut state = [0u8; STATE_LEN];
        for b in &mut state {
            *b = rng.byte();
        }
        if round % 2 == 0 {
            state[0..3].copy_from_slice(&[2, 2, 2]);
            state[3..7].copy_from_slice(&7u32.to_le_bytes());
            state[59] = (round % 4 == 0) as u8;
        }
        let scheme = &schemes[round % schemes.len()];
        if let Ok(mut check) = Check::restore(&state) {
            for _ in 0..16 {
                match check.run(scheme, rng.budget()) {
                    Ok(Verdict::Running) => {}
                    _ => break,
                }
            }
        }
    }
}
