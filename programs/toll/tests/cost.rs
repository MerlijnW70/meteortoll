#![allow(clippy::result_large_err)]

mod common;

use common::*;
use toll::state::AttemptStatus;

const CEILING: u64 = 1_200_000;

fn sparse(n: u8, rank: u32, counts: (u16, u16, u16)) -> Vec<u8> {
    let mut bytes = vec![n, n, n];
    bytes.extend_from_slice(&rank.to_le_bytes());
    for _ in 0..rank {
        for count in [counts.0, counts.1, counts.2] {
            bytes.extend_from_slice(&count.to_le_bytes());
            for i in 0..count {
                bytes.extend_from_slice(&i.to_le_bytes());
                bytes.push(1);
            }
        }
    }
    bytes
}

#[test]
fn verify_cost_sparse() {
    for counts in [(0u16, 0u16, 0u16), (1, 0, 0), (1, 1, 1), (2, 1, 1), (3, 3, 3)] {
        let scheme = sparse(16, 4000, counts);
        let mut env = setup((16, 16, 16), 4000);
        let run = upload(&mut env, &scheme, [3u8; 32]);
        reveal(&mut env, &run).unwrap();
        let costs = verify_all(&mut env, &run, toll::VERIFY_BUDGET);
        let peak = *costs.iter().max().unwrap();
        println!("verify_sparse_{counts:?}: calls {} peak_cu {peak}", costs.len());
        assert!(peak < CEILING, "sparse {counts:?} peaks at {peak} compute units");
    }
}

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

fn dense_product(n: (u8, u8, u8)) -> Vec<u8> {
    let mut bytes = vec![n.0, n.1, n.2];
    bytes.extend_from_slice(&1u32.to_le_bytes());
    let (a, b, c) = (u16::from(n.0), u16::from(n.1), u16::from(n.2));
    for len in [a * b, b * c, c * a] {
        bytes.extend_from_slice(&len.to_le_bytes());
        for index in 0..len {
            bytes.extend_from_slice(&index.to_le_bytes());
            bytes.push(1);
        }
    }
    bytes
}

#[test]
fn heaviest_product_fits() {
    let shape = (48, 32, 32);
    let (a, b, c) = (u32::from(shape.0), u32::from(shape.1), u32::from(shape.2));
    assert_eq!(a * b + b * c + c * a, meteortoll::check::MAX_PRODUCT_COST);
    let scheme = dense_product(shape);
    let mut env = setup(shape, a * b);
    let run = upload(&mut env, &scheme, [16u8; 32]);
    reveal(&mut env, &run).unwrap();
    let costs = verify_all(&mut env, &run, toll::VERIFY_BUDGET);
    let peak = *costs.iter().max().unwrap();
    println!("verify_dense_product: calls {} peak_cu {peak}", costs.len());
    assert!(peak < CEILING, "the heaviest product peaks at {peak} compute units");
    let attempt = attempt_of(&env, &run.attempt);
    assert_eq!((attempt.status, attempt.bond), (AttemptStatus::Fails, 0));
}
