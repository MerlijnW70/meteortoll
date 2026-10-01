use meteortoll::check::{Seed, TAG_A, TAG_B, TAG_G, draw};

fn ramp() -> Seed {
    let mut bytes = [0u8; 32];
    for (index, slot) in bytes.iter_mut().enumerate() {
        *slot = index as u8;
    }
    Seed(bytes)
}

#[test]
fn draws_match_the_python_reference_for_a_zero_seed() {
    let seed = Seed([0; 32]);
    assert_eq!(draw(&seed, TAG_A, 0).value(), 722_653_535_118_033_831);
    assert_eq!(draw(&seed, TAG_B, 0).value(), 892_302_818_377_535_293);
    assert_eq!(draw(&seed, TAG_G, 0).value(), 696_675_218_233_259_938);
    assert_eq!(draw(&seed, TAG_A, 5).value(), 2_259_327_633_714_405_677);
    assert_eq!(draw(&seed, TAG_G, u32::MAX).value(), 658_263_571_487_847_874);
}

#[test]
fn draws_match_the_python_reference_for_a_ramp_seed() {
    let seed = ramp();
    assert_eq!(draw(&seed, TAG_A, 0).value(), 1_343_596_568_440_972_147);
    assert_eq!(draw(&seed, TAG_B, 0).value(), 2_090_585_398_902_151_422);
    assert_eq!(draw(&seed, TAG_G, 0).value(), 619_098_617_556_079_759);
    assert_eq!(draw(&seed, TAG_A, 5).value(), 2_008_937_470_205_660_680);
    assert_eq!(draw(&seed, TAG_G, u32::MAX).value(), 1_660_704_416_815_591_520);
}

#[test]
fn the_three_matrices_draw_different_values_at_the_same_index() {
    let seed = ramp();
    for index in [0, 1, 77] {
        let (a, b, g) = (draw(&seed, TAG_A, index), draw(&seed, TAG_B, index), draw(&seed, TAG_G, index));
        assert!(a != b && b != g && a != g, "index {index}");
    }
}
