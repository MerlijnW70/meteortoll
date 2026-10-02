//! The numbers the README states about the check, read from the code, so the README can only state
//! what the verifier implements.

use meteortoll::check::error_bound;
use meteortoll::field::P;
use meteortoll::scheme::Header;

const fn shape(n1: u8, n2: u8, n3: u8) -> Header {
    Header { n1, n2, n3, rank: 1 }
}

#[test]
fn modulus_and_error_bound() {
    assert_eq!(P, (1u64 << 61) - 1);
    let bits = u64::BITS - P.leading_zeros();
    // Mersenne: every bit set, so P = 2^bits - 1.
    assert_eq!(P.count_ones(), bits);
    println!("fact: modulus 2^61 - 1 = {P}");
    println!("fact: modulus width {bits} bits");
    // A wrong scheme passes with probability at most (n1 n2 + n2 n3 + n3 n1) / P.
    for header in [shape(7, 7, 9), shape(9, 11, 13), shape(255, 255, 255)] {
        let bound = error_bound(&header);
        println!(
            "fact: error bound for n1 {} n2 {} n3 {}: {bound}/2^61, at most {:.1e}",
            header.n1,
            header.n2,
            header.n3,
            bound as f64 / P as f64
        );
    }
    assert_eq!(error_bound(&shape(7, 7, 9)), 175);
    assert_eq!(error_bound(&shape(9, 11, 13)), 359);
    assert!((error_bound(&shape(255, 255, 255)) as f64 / P as f64) < 1e-13);
}
