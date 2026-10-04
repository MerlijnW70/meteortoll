#![allow(clippy::result_large_err)]

mod common;

use common::*;
use solana_signer::Signer;
use toll::state::AttemptStatus;

const SHAPE: (u8, u8, u8) = (7, 7, 9);
const RECORD: &str = "7x7x9_m314_ZT";
const RANK: u32 = 314;

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
}

fn header(rank: u32) -> Vec<u8> {
    let mut out = vec![SHAPE.0, SHAPE.1, SHAPE.2];
    out.extend_from_slice(&rank.to_le_bytes());
    out
}

fn factor(rng: &mut Rng, len: u16, out: &mut Vec<u8>) {
    let mut indices: Vec<u16> = (0..len).filter(|_| rng.below(5) == 0).collect();
    indices.truncate(12);
    out.extend_from_slice(&(indices.len() as u16).to_le_bytes());
    for index in indices {
        out.extend_from_slice(&index.to_le_bytes());
        let coef = [1i8, -1, 2, -2, 127, -128][rng.below(6)];
        out.push(coef as u8);
    }
}

fn random_scheme(rng: &mut Rng) -> Vec<u8> {
    let rank = 1 + rng.below(40) as u32;
    let mut out = header(rank);
    for _ in 0..rank {
        factor(rng, u16::from(SHAPE.0) * u16::from(SHAPE.1), &mut out);
        factor(rng, u16::from(SHAPE.1) * u16::from(SHAPE.2), &mut out);
        factor(rng, u16::from(SHAPE.2) * u16::from(SHAPE.0), &mut out);
    }
    out
}

fn candidate(rng: &mut Rng, record: &[u8]) -> Vec<u8> {
    match rng.below(7) {
        0 => record.to_vec(),
        1 => {
            let mut out = record.to_vec();
            for _ in 0..=rng.below(4) {
                let at = 7 + rng.below(out.len() - 7);
                out[at] ^= 1 << rng.below(8);
            }
            out
        }
        2 => record[..7 + rng.below(record.len() - 7)].to_vec(),
        3 => {
            let mut out = record.to_vec();
            for _ in 0..=rng.below(32) {
                out.push(rng.next() as u8);
            }
            out
        }
        4 => random_scheme(rng),
        5 => {
            let mut out = header(1 + rng.below(RANK as usize) as u32);
            for _ in 0..rng.below(600) {
                out.push(rng.next() as u8);
            }
            out
        }
        _ => {
            let mut out = record.to_vec();
            out[3..7].copy_from_slice(&(RANK + 1 + rng.below(1000) as u32).to_le_bytes());
            out
        }
    }
}

#[test]
fn every_check_settles() {
    let record = fixture(RECORD);
    let mut rng = Rng(0x5DEE_CE66_D1CE_4E5B);
    let mut verdicts = [0usize; 3];
    for round in 0..6 {
        let mut env = setup(SHAPE, RANK);
        let mut runs = Vec::new();
        for slot in 0..8 {
            let scheme = candidate(&mut rng, &record);
            let mut salt = [0u8; 32];
            salt[0] = round;
            salt[1] = slot;
            runs.push(upload(&mut env, &scheme, salt));
        }
        let mut revealed = Vec::new();
        for run in &runs {
            let before = problem(&env).pending;
            match reveal(&mut env, run) {
                Ok(_) => {
                    assert_eq!(problem(&env).pending, before + 1);
                    revealed.push(run);
                }
                Err(_) => {
                    verdicts[2] += 1;
                    assert_eq!(problem(&env).pending, before);
                    assert_eq!(attempt_of(&env, &run.attempt).status, AttemptStatus::Committed);
                }
            }
        }
        for run in revealed {
            verify_all(&mut env, run, toll::VERIFY_BUDGET);
            let attempt = attempt_of(&env, &run.attempt);
            match attempt.status {
                AttemptStatus::Holds => verdicts[0] += 1,
                AttemptStatus::Fails => {
                    verdicts[1] += 1;
                    assert_eq!(attempt.bond, 0);
                }
                other => panic!("a check ended in {other:?}"),
            }
        }
        assert_eq!(problem(&env).pending, 0);
        advance(&mut env, GRACE);
        let settled = problem(&env);
        if let Some(solver) = settled.solver {
            let winner = runs.iter().find(|run| run.solver.pubkey() == solver).expect("the solver made an attempt");
            let (base, quote) = wallets(&mut env, &solver);
            let claim = claim_ix(&env, &solver, base, quote);
            send(&mut env.svm, &[claim], &winner.solver, &[]).unwrap();
        }
    }
    assert!(verdicts.iter().all(|&n| n > 0), "every outcome occurs: {verdicts:?}");
}
