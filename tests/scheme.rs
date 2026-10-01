mod common;

use common::{Builder, strassen};
use meteortoll::scheme::{ENTRY_LEN, Error, Factor, HEADER_LEN, Header};

#[test]
fn header() {
    let encoded = strassen().encode();
    let header = Header::parse(&encoded).unwrap();
    assert_eq!(header, Header { n1: 2, n2: 2, n3: 2, rank: 7 });
    let wide = Header::parse(&[3, 4, 5, 0x01, 0x02, 0x03, 0x04]).unwrap();
    assert_eq!(wide.rank, 0x0403_0201);
    assert_eq!((wide.len_u(), wide.len_v(), wide.len_w(), wide.triples()), (12, 20, 15, 60));
}

#[test]
fn short_header() {
    assert_eq!(Header::parse(&[2, 2, 2, 7, 0, 0]), Err(Error::Truncated));
    assert_eq!(HEADER_LEN, 7);
}

#[test]
fn zero_dimension() {
    for header in [[0, 2, 2, 1, 0, 0, 0], [2, 0, 2, 1, 0, 0, 0], [2, 2, 0, 1, 0, 0, 0]] {
        assert_eq!(Header::parse(&header), Err(Error::EmptyDimension));
    }
}

#[test]
fn zero_rank() {
    assert_eq!(Header::parse(&[1, 1, 1, 0, 0, 0, 0]), Err(Error::ZeroRank));
}

fn one_factor(entries: &[(u16, i8)]) -> Vec<u8> {
    let mut bytes = (entries.len() as u16).to_le_bytes().to_vec();
    for &(index, coef) in entries {
        bytes.extend_from_slice(&index.to_le_bytes());
        bytes.push(coef as u8);
    }
    bytes
}

#[test]
fn factor_entries() {
    let mut bytes = vec![0xaa];
    bytes.extend(one_factor(&[(0, 1), (3, -1), (300, 127)]));
    bytes.push(0xbb);
    let (factor, end) = Factor::read(&bytes, 1, 301).unwrap();
    assert_eq!(factor.count(), 3);
    assert_eq!(factor.iter().collect::<Vec<_>>(), [(0, 1), (3, -1), (300, 127)]);
    assert_eq!(end, 1 + 2 + 3 * ENTRY_LEN);
    assert_eq!(bytes[end], 0xbb);
}

#[test]
fn empty_factor() {
    let bytes = one_factor(&[]);
    let (factor, end) = Factor::read(&bytes, 0, 4).unwrap();
    assert_eq!((factor.count(), end), (0, 2));
}

#[test]
fn index_out_of_range() {
    assert_eq!(Factor::read(&one_factor(&[(3, 1)]), 0, 4).map(|(_, end)| end), Ok(5));
    assert!(matches!(Factor::read(&one_factor(&[(4, 1)]), 0, 4), Err(Error::IndexOutOfRange)));
}

#[test]
fn indices_increase() {
    assert!(matches!(Factor::read(&one_factor(&[(2, 1), (2, 1)]), 0, 4), Err(Error::IndexNotIncreasing)));
    assert!(matches!(Factor::read(&one_factor(&[(2, 1), (1, 1)]), 0, 4), Err(Error::IndexNotIncreasing)));
}

#[test]
fn zero_coefficient() {
    assert!(matches!(Factor::read(&one_factor(&[(1, 0)]), 0, 4), Err(Error::ZeroCoefficient)));
}

#[test]
fn cut_factor() {
    let bytes = one_factor(&[(0, 1), (1, 1)]);
    assert!(matches!(Factor::read(&bytes[..bytes.len() - 1], 0, 4), Err(Error::Truncated)));
    assert!(matches!(Factor::read(&bytes[..1], 0, 4), Err(Error::Truncated)));
}

#[test]
fn builder_round_trip() {
    let mut s = Builder::new(2, 3, 2);
    s.product(&[((1, 2), -3)], &[((2, 1), 5)], &[((1, 1), 7)]);
    let encoded = s.encode();
    let (u, after_u) = Factor::read(&encoded, HEADER_LEN, 6).unwrap();
    let (v, after_v) = Factor::read(&encoded, after_u, 6).unwrap();
    let (w, after_w) = Factor::read(&encoded, after_v, 4).unwrap();
    assert_eq!(u.iter().collect::<Vec<_>>(), [(5, -3)]);
    assert_eq!(v.iter().collect::<Vec<_>>(), [(5, 5)]);
    assert_eq!(w.iter().collect::<Vec<_>>(), [(3, 7)]);
    assert_eq!(after_w, encoded.len());
}

#[test]
fn factor_limit() {
    let bytes = one_factor(&[(0, 1), (1, 1), (2, 1)]);
    assert!(Factor::read_within(&bytes, 0, 4, 3).is_ok());
    assert!(matches!(Factor::read_within(&bytes, 0, 4, 2), Err(Error::ProductTooLarge)));
    let mut claimed = bytes.clone();
    claimed[..2].copy_from_slice(&u16::MAX.to_le_bytes());
    assert!(matches!(Factor::read_within(&claimed, 0, 4, 3), Err(Error::ProductTooLarge)));
}
