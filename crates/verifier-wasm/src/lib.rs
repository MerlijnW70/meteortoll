//! C ABI over the verifier core for the browser. The host copies a scheme and a 32-byte seed
//! into memory from `alloc`, calls `start`, then `step` until it stops returning `RUNNING`,
//! reading the running sums in between to animate them.

use std::cell::RefCell;

use meteortoll::check::{Check, Seed, Verdict};

pub const RUNNING: i32 = 0;
pub const HOLDS: i32 = 1;
pub const FAILS: i32 = 2;
pub const MALFORMED: i32 = -1;
pub const NOT_STARTED: i32 = -2;

struct Session {
    scheme: Vec<u8>,
    check: Check,
}

thread_local! {
    static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) };
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// # Safety
/// `pointer` and `len` must come from one `alloc` call that has not been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc(pointer: *mut u8, len: usize) {
    // SAFETY: the caller passes back exactly what `alloc` handed out.
    drop(unsafe { Vec::from_raw_parts(pointer, 0, len) });
}

/// # Safety
/// `scheme` must point to `len` readable bytes and `seed` to 32.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn start(scheme: *const u8, len: usize, seed: *const u8) -> i32 {
    // SAFETY: the caller guarantees both regions are readable for these lengths.
    let (scheme, seed) = unsafe { (std::slice::from_raw_parts(scheme, len).to_vec(), std::slice::from_raw_parts(seed, 32)) };
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(seed);
    match Check::start(&scheme, &Seed(bytes)) {
        Ok(check) => {
            SESSION.with(|session| *session.borrow_mut() = Some(Session { scheme, check }));
            RUNNING
        }
        Err(_) => MALFORMED,
    }
}

/// Starts from a saved state, such as an attempt account's `check` field, so the browser can
/// replay exactly the point the program used. Progress in the state is kept; the host zeroes
/// it to replay from the beginning.
///
/// # Safety
/// `scheme` must point to `len` readable bytes and `state` to `STATE_LEN`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn start_from_state(scheme: *const u8, len: usize, state: *const u8) -> i32 {
    // SAFETY: the caller guarantees both regions are readable for these lengths.
    let (scheme, state) = unsafe {
        (std::slice::from_raw_parts(scheme, len).to_vec(), std::slice::from_raw_parts(state, meteortoll::check::STATE_LEN))
    };
    let mut saved = [0u8; meteortoll::check::STATE_LEN];
    saved.copy_from_slice(state);
    match Check::restore(&saved) {
        Ok(check) => {
            SESSION.with(|session| *session.borrow_mut() = Some(Session { scheme, check }));
            RUNNING
        }
        Err(_) => MALFORMED,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn step(budget: u32) -> i32 {
    SESSION.with(|session| match session.borrow_mut().as_mut() {
        None => NOT_STARTED,
        Some(Session { scheme, check }) => match check.run(scheme, budget) {
            Ok(Verdict::Running) => RUNNING,
            Ok(Verdict::Holds) => HOLDS,
            Ok(Verdict::Fails) => FAILS,
            Err(_) => MALFORMED,
        },
    })
}

fn read<T>(view: impl Fn(&Check) -> T, empty: T) -> T {
    SESSION.with(|session| session.borrow().as_ref().map_or(empty, |s| view(&s.check)))
}

#[unsafe(no_mangle)]
pub extern "C" fn rank() -> u32 {
    read(|check| check.header().rank, 0)
}

#[unsafe(no_mangle)]
pub extern "C" fn triples_total() -> u32 {
    read(|check| check.header().triples(), 0)
}

#[unsafe(no_mangle)]
pub extern "C" fn products_done() -> u32 {
    read(Check::products, 0)
}

#[unsafe(no_mangle)]
pub extern "C" fn triples_done() -> u32 {
    read(Check::triples, 0)
}

#[unsafe(no_mangle)]
pub extern "C" fn lhs() -> u64 {
    read(|check| check.lhs().value(), 0)
}

#[unsafe(no_mangle)]
pub extern "C" fn rhs() -> u64 {
    read(|check| check.rhs().value(), 0)
}
