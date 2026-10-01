use meteortoll::field::{Fp, P};

#[test]
fn new_reduces() {
    assert_eq!(Fp::new(P), Fp::ZERO);
    assert_eq!(Fp::new(P + 5).value(), 5);
    assert_eq!(Fp::new(u64::MAX).value(), u64::MAX % P);
    assert_eq!(Fp::new(P - 1).value(), P - 1);
}

#[test]
fn negative_residues() {
    assert_eq!(Fp::from_i64(-1).value(), P - 1);
    assert_eq!(Fp::from_i64(-7).add(Fp::new(7)), Fp::ZERO);
    assert_eq!(Fp::from_i64(0), Fp::ZERO);
    assert_eq!(Fp::from_i64(i64::MIN).value(), P - (1u64 << 63) % P);
}

#[test]
fn addition_wraps() {
    assert_eq!(Fp::new(P - 1).add(Fp::ONE), Fp::ZERO);
    assert_eq!(Fp::new(P - 1).add(Fp::new(2)).value(), 1);
    assert_eq!(Fp::new(3).add(Fp::new(4)).value(), 7);
}

#[test]
fn subtraction_negation() {
    assert_eq!(Fp::new(3).sub(Fp::new(5)).value(), P - 2);
    assert_eq!(Fp::new(5).sub(Fp::new(3)).value(), 2);
    assert_eq!(Fp::ZERO.neg(), Fp::ZERO);
    assert_eq!(Fp::new(9).neg().value(), P - 9);
}

#[test]
fn mul_matches_wide() {
    let cases = [
        (0, 12345),
        (1, P - 1),
        (P - 1, P - 1),
        (1 << 60, 1 << 60),
        (0x1234_5678_9abc_def0 % P, 0x0fed_cba9_8765_4321 % P),
        (P - 2, 3),
    ];
    for (a, b) in cases {
        let expected = ((a as u128 * b as u128) % P as u128) as u64;
        assert_eq!(Fp::new(a).mul(Fp::new(b)).value(), expected, "{a} * {b}");
    }
}

#[test]
fn mul_distributes() {
    let a = Fp::new(0x0123_4567_89ab_cdef);
    let b = Fp::new(0x1fff_ffff_0000_0001);
    let c = Fp::from_i64(-424_242);
    assert_eq!(a.mul(b.add(c)), a.mul(b).add(a.mul(c)));
}

fn reference(a: u64, b: u64) -> u64 {
    ((a as u128 * b as u128) % P as u128) as u64
}

#[test]
fn mul_split_boundaries() {
    let edges = [0, 1, 2, 7, 8, (1 << 29) - 1, 1 << 29, (1 << 32) - 1, 1 << 32, (1 << 32) + 1, (1 << 60) - 1, 1 << 60, P - 2, P - 1];
    for a in edges {
        for b in edges {
            assert_eq!(Fp::new(a).mul(Fp::new(b)).value(), reference(a, b), "{a} * {b}");
        }
    }
}

#[test]
fn mul_random_pairs() {
    let mut state = 0x9e37_79b9_7f4a_7c15u64;
    let mut next = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state % P
    };
    for _ in 0..1_000_000 {
        let (a, b) = (next(), next());
        assert_eq!(Fp::new(a).mul(Fp::new(b)).value(), reference(a, b), "{a} * {b}");
    }
}
