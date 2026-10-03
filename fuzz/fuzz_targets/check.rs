#![no_main]

use libfuzzer_sys::fuzz_target;
use meteortoll::check::{Check, Seed, Verdict, verify};

fuzz_target!(|data: &[u8]| {
    if data.len() < 36 {
        return;
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&data[..32]);
    let seed = Seed(seed);
    let budget = u32::from_le_bytes([data[32], data[33], data[34], data[35]]) % 8_192;
    let scheme = &data[36..];
    let whole = verify(scheme, &seed);
    let Ok(mut check) = Check::start(scheme, &seed) else {
        assert!(whole.is_err());
        return;
    };
    let limit = u64::from(check.header().rank) + 2;
    for _ in 0..limit {
        let before = check.products();
        let step = check.run(scheme, budget);
        let restored = Check::restore(&check.save()).expect("a saved state restores");
        assert_eq!(restored, check);
        match step {
            Ok(Verdict::Running) => assert!(check.products() > before),
            other => {
                assert_eq!(other, whole);
                return;
            }
        }
        check = restored;
    }
    panic!("no verdict within rank + 2 calls");
});
