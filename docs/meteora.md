# Meteora integration

How meteortoll uses Meteora's Dynamic Bonding Curve and DAMM v2: every path from launch to payout,
the toll program instruction that takes it, and the Meteora call it makes.

Everything below is tested against the **mainnet** DBC, DAMM v2 and Metaplex program binaries in
LiteSVM (`programs/toll/tests/dbc.rs`), and run end to end on devnet:

| Path | Instruction | Meteora call |
|---|---|---|
| Launch config | built by Meteora's SDK (`buildCurveWithMarketCap`) | `create_config` |
| Problem owns its pool | `register_problem` checks `pool.creator == problem` | `initialize_virtual_pool_with_spl_token`, `transfer_pool_creator` |
| Curve fees → bounty | `sweep_trading_fees` | CPI `claim_creator_trading_fee` |
| Surplus → bounty | `sweep_surplus` | CPI `creator_withdraw_surplus` |
| Graduated fees → bounty | `sweep_position_fees` | CPI DAMM v2 `claim_position_fee` |
| Trading in the app | quotes and swaps that fill partially, so a last buy can complete the curve | DBC SDK `swapQuote2`, `swap2` |
| Live trades | decoded `EvtSwap2` events | DBC event CPI |
| Fees from every source, by anyone | the problem page's sweep button sends the three sweeps above | `sweep_trading_fees`, `sweep_surplus`, `sweep_position_fees` |

The test `app/src/lib/docs.test.ts` checks this table against the code: every instruction and call
it names must be one the program or the app actually uses.
