//! The numbers the README states about the check, read from the code, so the README can only state
//! what the verifier implements.

use meteortoll::check::{TAG_A, TAG_B, TAG_G};
use meteortoll::field::P;

#[test]
fn modulus_and_error_bound() {
    assert_eq!(P, (1u64 << 61) - 1);
    // The checked identity is trilinear, one factor each from A, B and G, so it has degree 3 in
    // the random point and Schwartz-Zippel bounds a wrong scheme's pass rate by 3/p.
    let degree = [TAG_A, TAG_B, TAG_G].len();
    assert_eq!(degree, 3);
    let bits = u64::BITS - P.leading_zeros();
    // Mersenne: every bit set, so P = 2^bits - 1.
    assert_eq!(P.count_ones(), bits);
    println!("fact: modulus 2^61 - 1 = {P}");
    println!("fact: modulus width {bits} bits");
    println!("fact: error bound {degree}/2^61");
    println!("fact: false pass probability at most {:.2e} ({degree} in 2^{bits})", degree as f64 / P as f64);
}
