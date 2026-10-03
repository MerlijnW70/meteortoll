#![no_main]

use libfuzzer_sys::fuzz_target;
use meteortoll::check::{Check, STATE_LEN, Verdict};

fuzz_target!(|data: &[u8]| {
    if data.len() < STATE_LEN + 4 {
        return;
    }
    let mut state = [0u8; STATE_LEN];
    state.copy_from_slice(&data[..STATE_LEN]);
    let budget = u32::from_le_bytes([data[STATE_LEN], data[STATE_LEN + 1], data[STATE_LEN + 2], data[STATE_LEN + 3]]);
    let scheme = &data[STATE_LEN + 4..];
    if let Ok(mut check) = Check::restore(&state) {
        for _ in 0..64 {
            if !matches!(check.run(scheme, budget), Ok(Verdict::Running)) {
                break;
            }
        }
    }
});
