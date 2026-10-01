#![allow(clippy::result_large_err)] // the error type is LiteSVM's FailedTransactionMetadata; boxing it in tests buys nothing

mod common;

use common::*;
use toll::state::AttemptStatus;

/// Prints the compute units the verify crank uses on real `fmm` records, one line per run.
#[test]
fn verifying_each_record_reports_its_compute_cost() {
    for name in ["7x7x9_m314_ZT", "4x9x8_m208_Z", "2x12x15_m280_ZT", "9x10x10_m596_ZT"] {
        let scheme = fixture(name);
        let shape = (scheme[0], scheme[1], scheme[2]);
        let rank = u32::from_le_bytes(scheme[3..7].try_into().unwrap());
        for budget in [2_000u32, 5_000, 10_000] {
            let mut env = setup(shape, rank);
            let run = upload(&mut env, &scheme, [15u8; 32]);
            reveal(&mut env, &run).unwrap();
            let costs = verify_all(&mut env, &run, budget);
            assert_eq!(attempt_of(&env, &run.attempt).status, AttemptStatus::Holds);
            let peak = costs.iter().max().unwrap();
            let total: u64 = costs.iter().sum();
            println!(
                "verify_{name}_budget_{budget}: bytes {} calls {} peak_cu {peak} total_cu {total}",
                scheme.len(),
                costs.len()
            );
        }
    }
}
