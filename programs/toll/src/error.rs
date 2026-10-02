use anchor_lang::prelude::*;

#[error_code]
pub enum TollError {
    #[msg("The pool does not belong to the launchpad's DBC config")]
    WrongConfig,
    #[msg("The pool's creator is not this problem")]
    CreatorIsNotProblem,
    #[msg("The mint does not match the pool")]
    WrongMint,
    #[msg("Dimensions must be nonzero and the target below the naive rank")]
    BadStatement,
    #[msg("The problem is already solved")]
    AlreadySolved,
    #[msg("The attempt is not in the state this instruction needs")]
    WrongStatus,
    #[msg("The submission account is not usable")]
    BadSubmission,
    #[msg("The write falls outside the submission")]
    OutOfBounds,
    #[msg("The revealed scheme does not match the commitment")]
    CommitmentMismatch,
    #[msg("The scheme is for other dimensions or above the target rank")]
    SchemeDoesNotAnswer,
    #[msg("No slot hash newer than the commitment exists yet")]
    RevealTooEarly,
    #[msg("Only the solver of a solved problem may claim")]
    NotSolver,
    #[msg("The attempt cannot be closed while its check is pending")]
    CheckPending,
    #[msg("The solve is not final until its grace window has passed")]
    GracePending,
    #[msg("The grace window must be between 150 and 216000 slots")]
    BadGrace,
    #[msg("The scheme can be written from the slot after the commitment")]
    WriteTooEarly,
}
