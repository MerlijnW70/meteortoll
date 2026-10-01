mod common;

use common::{Builder, FIXTURES, coefficient_offsets, fixture, naive, seed, strassen};
use meteortoll::check::{Check, STATE_LEN, Verdict, verify};
use meteortoll::scheme::Error;

#[test]
fn the_naive_scheme_holds_for_every_shape() {
    for (n1, n2, n3) in [(1, 1, 1), (2, 3, 4), (4, 3, 2), (3, 1, 5), (5, 5, 1)] {
        let encoded = naive(n1, n2, n3).encode();
        assert_eq!(verify(&encoded, &seed(1)), Ok(Verdict::Holds), "{n1}x{n2}x{n3}");
    }
}

#[test]
fn strassens_scheme_holds_at_a_random_point() {
    let encoded = strassen().encode();
    for byte in 0..8 {
        assert_eq!(verify(&encoded, &seed(byte)), Ok(Verdict::Holds));
    }
}

#[test]
fn every_fmm_record_holds_at_several_points() {
    for name in FIXTURES {
        let encoded = fixture(name);
        for byte in 0..4 {
            assert_eq!(verify(&encoded, &seed(byte)), Ok(Verdict::Holds), "{name} seed {byte}");
        }
    }
}

#[test]
fn dropping_a_product_fails() {
    for drop in 0..7 {
        let mut s = strassen();
        s.products.remove(drop);
        assert_eq!(verify(&s.encode(), &seed(2)), Ok(Verdict::Fails), "without product {drop}");
    }
}

#[test]
fn outputs_sent_to_the_wrong_cell_fail() {
    let mut s = Builder::new(2, 3, 4);
    for i in 0..2 {
        for j in 0..3 {
            for k in 0..4 {
                s.product(&[((i, j), 1)], &[((j, k), 1)], &[((1 - i, k), 1)]);
            }
        }
    }
    assert_eq!(verify(&s.encode(), &seed(3)), Ok(Verdict::Fails));
}

#[test]
fn a_single_wrong_sign_in_strassen_fails() {
    let encoded = strassen().encode();
    for at in coefficient_offsets(&encoded) {
        let mut broken = encoded.clone();
        broken[at] = (broken[at] as i8).wrapping_neg() as u8;
        assert_eq!(verify(&broken, &seed(4)), Ok(Verdict::Fails), "byte {at}");
    }
}

#[test]
fn changed_coefficients_in_a_record_fail() {
    let encoded = fixture("7x7x9_m314_ZT");
    let offsets = coefficient_offsets(&encoded);
    for at in offsets.iter().step_by(97).copied() {
        for replacement in [2i8, -2, 127, -128] {
            let mut broken = encoded.clone();
            if broken[at] as i8 == replacement {
                continue;
            }
            broken[at] = replacement as u8;
            assert_eq!(verify(&broken, &seed(5)), Ok(Verdict::Fails), "byte {at} -> {replacement}");
        }
    }
}

#[test]
fn a_moved_index_fails() {
    let mut encoded = strassen().encode();
    let first_index = coefficient_offsets(&encoded)[0] - 2;
    assert_eq!(&encoded[first_index..first_index + 2], &[0, 0]);
    encoded[first_index] = 1;
    assert_eq!(verify(&encoded, &seed(6)), Ok(Verdict::Fails));
}

#[test]
fn small_budgets_reach_the_same_verdict() {
    let good = fixture("2x12x15_m280_ZT");
    let mut bad = good.clone();
    let at = coefficient_offsets(&good)[11];
    bad[at] = (bad[at] as i8).wrapping_neg() as u8;
    for (encoded, want) in [(&good, Verdict::Holds), (&bad, Verdict::Fails)] {
        for budget in [0, 1, 5, 64, 1000] {
            let mut check = Check::start(encoded, &seed(7)).unwrap();
            let mut calls = 0;
            let verdict = loop {
                calls += 1;
                match check.run(encoded, budget).unwrap() {
                    Verdict::Running => continue,
                    done => break done,
                }
            };
            assert_eq!(verdict, want, "budget {budget}");
            if budget < 1000 {
                assert!(calls > 1, "budget {budget} finished in one call");
            }
        }
    }
}

#[test]
fn a_zero_budget_still_advances_every_call() {
    let encoded = strassen().encode();
    let mut check = Check::start(&encoded, &seed(8)).unwrap();
    let mut running = 0;
    while check.run(&encoded, 0).unwrap() == Verdict::Running {
        running += 1;
        assert!(running <= 14, "no progress");
    }
    assert_eq!(running, 14);
}

#[test]
fn a_budget_stops_before_the_direct_product_is_done() {
    let encoded = naive(2, 2, 2).encode();
    let mut check = Check::start(&encoded, &seed(9)).unwrap();
    assert_eq!(check.run(&encoded, 24), Ok(Verdict::Running));
    assert_eq!(check.run(&encoded, 7), Ok(Verdict::Running));
    assert_eq!(check.run(&encoded, 1), Ok(Verdict::Holds));
}

#[test]
fn the_header_is_kept() {
    let encoded = naive(2, 3, 4).encode();
    let check = Check::start(&encoded, &seed(0)).unwrap();
    let header = check.header();
    assert_eq!((header.n1, header.n2, header.n3, header.rank), (2, 3, 4, 24));
}

#[test]
fn trailing_bytes_are_rejected_after_the_last_product() {
    let mut encoded = strassen().encode();
    encoded.push(0);
    assert_eq!(verify(&encoded, &seed(0)), Err(Error::TrailingBytes));
}

#[test]
fn a_rank_larger_than_the_products_given_is_truncated() {
    let mut encoded = strassen().encode();
    encoded[3] = 8;
    assert_eq!(verify(&encoded, &seed(0)), Err(Error::Truncated));
}

#[test]
fn different_seeds_draw_different_points() {
    let mut s = Builder::new(1, 1, 1);
    s.product(&[((0, 0), 2)], &[((0, 0), 1)], &[((0, 0), 1)]);
    s.product(&[((0, 0), 1)], &[((0, 0), 1)], &[((0, 0), -1)]);
    let encoded = s.encode();
    assert_eq!(verify(&encoded, &seed(0)), Ok(Verdict::Holds));
    let mut odd = Builder::new(1, 1, 1);
    odd.product(&[((0, 0), 1)], &[((0, 0), 1)], &[((0, 0), 2)]);
    let odd = odd.encode();
    for byte in 0..16 {
        assert_eq!(verify(&odd, &seed(byte)), Ok(Verdict::Fails));
    }
}

#[test]
fn saving_and_restoring_between_calls_changes_nothing() {
    let good = fixture("4x9x8_m208_Z");
    let mut bad = good.clone();
    let at = coefficient_offsets(&good)[40];
    bad[at] = (bad[at] as i8).wrapping_neg() as u8;
    for (encoded, want) in [(&good, Verdict::Holds), (&bad, Verdict::Fails)] {
        let mut kept = Check::start(encoded, &seed(10)).unwrap();
        let mut saved = kept.save();
        let verdict = loop {
            let mut check = Check::restore(&saved).unwrap();
            assert_eq!(check, kept);
            let step = check.run(encoded, 50).unwrap();
            assert_eq!(kept.run(encoded, 50).unwrap(), step);
            saved = check.save();
            if step != Verdict::Running {
                break step;
            }
        };
        assert_eq!(verdict, want);
    }
}

#[test]
fn the_saved_layout_is_fixed() {
    let encoded = strassen().encode();
    let mut check = Check::start(&encoded, &seed(11)).unwrap();
    let fresh = check.save();
    assert_eq!(fresh.len(), STATE_LEN);
    assert_eq!(&fresh[..7], &encoded[..7]);
    assert_eq!(&fresh[15..23], &7u64.to_le_bytes());
    assert_eq!(&fresh[23..47], &[0u8; 24]);
    check.run(&encoded, 0).unwrap();
    let after = check.save();
    assert_eq!(&after[23..27], &1u32.to_le_bytes());
    assert_ne!(&after[31..39], &[0u8; 8]);
    assert_eq!(&after[7..15], &fresh[7..15]);
}

#[test]
fn a_saved_state_with_an_empty_dimension_does_not_restore() {
    let mut saved = Check::start(&strassen().encode(), &seed(0)).unwrap().save();
    saved[1] = 0;
    assert_eq!(Check::restore(&saved), Err(Error::EmptyDimension));
}

#[test]
fn any_valid_saved_state_round_trips_byte_for_byte() {
    let mut saved = [0u8; STATE_LEN];
    for (index, slot) in saved.iter_mut().enumerate() {
        *slot = 0x10 + index as u8;
    }
    saved[38] = 0x01;
    saved[46] = 0x01;
    let check = Check::restore(&saved).unwrap();
    assert_eq!(check.save(), saved);
}

#[test]
fn progress_is_visible_while_the_check_runs() {
    let encoded = naive(2, 2, 2).encode();
    let mut check = Check::start(&encoded, &seed(12)).unwrap();
    assert_eq!((check.products(), check.triples()), (0, 0));
    assert_eq!((check.lhs().value(), check.rhs().value()), (0, 0));
    check.run(&encoded, 3).unwrap();
    assert_eq!((check.products(), check.triples()), (1, 0));
    assert_ne!(check.lhs().value(), 0);
    check.run(&encoded, 21).unwrap();
    assert_eq!((check.products(), check.triples()), (8, 0));
    check.run(&encoded, 3).unwrap();
    assert_eq!(check.triples(), 3);
    assert_ne!(check.rhs().value(), 0);
    assert_eq!(check.run(&encoded, 100), Ok(Verdict::Holds));
    assert_eq!((check.products(), check.triples()), (8, 8));
    assert_eq!(check.lhs(), check.rhs());
}
