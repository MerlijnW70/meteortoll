use meteortoll::check::{Seed, coordinate, point};
use meteortoll::field::{Fp, P};

fn ramp() -> Seed {
    let mut bytes = [0u8; 32];
    for (index, slot) in bytes.iter_mut().enumerate() {
        *slot = index as u8;
    }
    Seed(bytes)
}

#[test]
fn point_from_seed() {
    let [r1, r2, r3] = point(&ramp());
    assert_eq!(r1.value(), u64::from_le_bytes([0, 1, 2, 3, 4, 5, 6, 7]) % P);
    assert_eq!(r2.value(), u64::from_le_bytes([8, 9, 10, 11, 12, 13, 14, 15]) % P);
    assert_eq!(r3.value(), u64::from_le_bytes([16, 17, 18, 19, 20, 21, 22, 23]) % P);
    let mut high = [0u8; 32];
    high[..8].copy_from_slice(&u64::MAX.to_le_bytes());
    assert_eq!(point(&Seed(high))[0].value(), u64::MAX % P);
}

#[test]
fn coordinates_are_powers() {
    let seed = ramp();
    for which in 0..3 {
        let r = point(&seed)[which];
        let mut expected = Fp::ONE;
        for index in 0..300u16 {
            assert_eq!(coordinate(&seed, which, index), expected, "matrix {which} index {index}");
            expected = expected.mul(r);
        }
    }
}

#[test]
fn largest_index() {
    let seed = ramp();
    let r = point(&seed)[2];
    let by_squaring = |mut e: u32| {
        let (mut result, mut base) = (Fp::ONE, r);
        while e > 0 {
            if e & 1 == 1 {
                result = result.mul(base);
            }
            base = base.mul(base);
            e >>= 1;
        }
        result
    };
    for index in [u16::MAX, 0x8000, 0x1234, 0x0f0f, 4096, 255] {
        assert_eq!(coordinate(&seed, 2, index), by_squaring(u32::from(index)), "index {index}");
    }
}

#[test]
fn matrices_differ() {
    let seed = ramp();
    for index in [1, 2, 77] {
        let (a, b, g) = (coordinate(&seed, 0, index), coordinate(&seed, 1, index), coordinate(&seed, 2, index));
        assert!(a != b && b != g && a != g, "index {index}");
    }
}
