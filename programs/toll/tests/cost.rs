#![allow(clippy::result_large_err)]

mod common;

use common::*;
use toll::state::AttemptStatus;

const CEILING: u64 = 1_200_000;

#[test]
fn verify_cost_per_record() {
    for name in ["7x7x9_m314_ZT", "4x9x8_m208_Z", "2x12x15_m280_ZT", "9x10x10_m596_ZT"] {
        let scheme = fixture(name);
        let shape = (scheme[0], scheme[1], scheme[2]);
        let rank = u32::from_le_bytes(scheme[3..7].try_into().unwrap());
        for budget in [2_000u32, toll::VERIFY_BUDGET] {
            let mut env = setup(shape, rank);
            let run = upload(&mut env, &scheme, [15u8; 32]);
            reveal(&mut env, &run).unwrap();
            let costs = verify_all(&mut env, &run, budget);
            assert_eq!(attempt_of(&env, &run.attempt).status, AttemptStatus::Holds);
            let peak = *costs.iter().max().unwrap();
            let total: u64 = costs.iter().sum();
            println!(
                "verify_{name}_budget_{budget}: bytes {} calls {} peak_cu {peak} total_cu {total}",
                scheme.len(),
                costs.len()
            );
            assert!(peak < CEILING, "{name} at budget {budget} peaks at {peak} compute units");
        }
    }
}

fn one_product(n: u8, heavy: usize) -> Vec<u8> {
    let mut bytes = vec![n, n, 2];
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&(heavy as u16).to_le_bytes());
    for index in 0..heavy as u16 {
        bytes.extend_from_slice(&index.to_le_bytes());
        bytes.push(1);
    }
    for _ in 0..2 {
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&0u16.to_le_bytes());
        bytes.push(1);
    }
    bytes
}

#[test]
fn heaviest_product_fits() {
    let limit = meteortoll::check::MAX_PRODUCT_COST as usize;
    for (heavy, label) in [(limit - 2, "at_the_limit"), (limit - 1, "one_past_the_limit")] {
        let scheme = one_product(64, heavy);
        let mut env = setup((64, 64, 2), 4096);
        let run = upload(&mut env, &scheme, [16u8; 32]);
        reveal(&mut env, &run).unwrap();
        let costs = verify_all(&mut env, &run, toll::VERIFY_BUDGET);
        let peak = *costs.iter().max().unwrap();
        println!("verify_product_{label}: calls {} peak_cu {peak}", costs.len());
        assert!(peak < CEILING, "{label} peaks at {peak} compute units");
        let attempt = attempt_of(&env, &run.attempt);
        assert_eq!((attempt.status, attempt.bond), (AttemptStatus::Fails, 0));
    }
}
