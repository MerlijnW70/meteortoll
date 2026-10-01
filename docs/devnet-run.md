# Devnet run, 2026-10-01

The whole lifecycle against Meteora's live devnet DBC program, driven by `client/` (`npm run toll -- …`).
Problem `7x7x9r314` is a **disclosed demo**: `fmm` already holds a rank-314 scheme for that format, so we
funded and solved it ourselves to show the mechanism, not to claim a public bounty.

| Step | Transaction |
|---|---|
| Program deploy (`3YjxqTwQnqSs8xMZ8TGz5S3gEJcG7qmvP5a6Y1bNJ5ey`) | [2cKkBcDB…](https://explorer.solana.com/tx/2cKkBcDBDjsCejSJBrk3GjZtAQ6ARsp5fAU9gW36gAZpb15ZACoazE3tpeCbXDPDz9XrThccQV94s4zeP1FEGscq?cluster=devnet) |
| DBC config `Z4PT2dz6…` (SDK-built, 100% creator fee share) | [2pmwAhDf…](https://explorer.solana.com/tx/2pmwAhDfcMdZzsentoDSpGaGt991mB26SqcBipNJPJKFzBx9ZAzx6ShDFLCUTBHXDknScaPaeKojYGHrK2AxtFSa?cluster=devnet) |
| Launchpad `5ZMaqTZ1…` | [3JpkWnQo…](https://explorer.solana.com/tx/3JpkWnQog3nDgQR2hGMq2Aiowpk9Vsk1EQygSoXFk91s4YV8xZXC8Nk6VPgeNHimHhmED3QNeSGLeFb4Au8d1FXj?cluster=devnet) |
| DBC pool `35Hwh87Q…`, token D779 | [3oNVerc7…](https://explorer.solana.com/tx/3oNVerc7fYmY9eSkBdRKZQdQenPJoNrSrz8mvtamSd8D3weDNXgkF5Kdb7BkG4gWWxuBSrwRPQnuiYdNsEVrcBnb?cluster=devnet) |
| Pool creator handed to problem `7NAPrQ2z…`, problem registered | [iqKCBFaW…](https://explorer.solana.com/tx/iqKCBFaWBvkKA433ujxzSPmGp5G5cj3aSrLsGUrzKRWUQUx4cnoxsaZUqR2xejuf7FHeWSEEsNPbRRN2tXhHj1Z?cluster=devnet) |
| Buy 0.1 SOL | [rwMHk8WC…](https://explorer.solana.com/tx/rwMHk8WCxR9JD7EPHCUUHNmdGReKeDXFUp8Nsj4eF2zRjoHeaz1NGaBz9CK7AECDXfPrdESPhdrpNU4JXPbEu4b?cluster=devnet) |
| Sweep creator fees into the bounty (0.0008 SOL) | [2YRZcozg…](https://explorer.solana.com/tx/2YRZcozgQCDbtzXfdkQoRtAoHkURaFmmGtCmbPKLRHQ6rVx6vxLmt2uGq3e9d7y9YEr4Q4DVAd5U7CoLSE5F5cLJ?cluster=devnet) |
| Commit (bond staked) | [4kriEiHk…](https://explorer.solana.com/tx/4kriEiHkr2UKXsh7HnGX4CSc2vL7zqNV9ttXoLXZFtuBUqjE1hEDDXKzy6cttxTYqnr4HPoVnDxdFeJeAh7AVJsW?cluster=devnet) |
| Open submission buffer (20,803 bytes, 24 chunks follow) | [4EQjN6YB…](https://explorer.solana.com/tx/4EQjN6YB78NN3YJEVvNu2dunFDyDp3uELai5kAAHMWfxfXcbEHPo5dF3HcWdh4nrf2iNz74BiFYoERKRoxfQibNd?cluster=devnet) |
| Reveal | [65d1qqhD…](https://explorer.solana.com/tx/65d1qqhDEngXKvZP7HbCtSAEHGjLH3MNPuqfKUNeCtHGtzpr6uRxEfv1Rt4H9ANH1tCCCsFrRC62cSantf2v5J1Q?cluster=devnet) |
| **Verify: the rank-314 scheme holds, in one transaction** | [4DpPqRrW…](https://explorer.solana.com/tx/4DpPqRrWvXz3ykTehAHSgumdkhu2cXENFvEVMKZjwkfinRuiWKbyN6wazBJu33G75yEPKayRFUGCmiDEygFcQHst?cluster=devnet) |
| Claim the bounty after the grace window | [3QhyevRy…](https://explorer.solana.com/tx/3QhyevryfHCvNb5WcvgXRc79vbEPHMsk1ihteamkYex5CSsAXw61EcrLvWcvBfGqsdbTT7eNt2YeDQ9naxPhH7vv?cluster=devnet) |
| Close the attempt: bond and buffer rent returned | [5Nffj1pL…](https://explorer.solana.com/tx/5Nffj1pLD18rs7pF8BGZqVY88kXdBwEGB6CsYW2Uq5RhSuzL9ye8BgFVCy7ZtGWZVjAbFgdJQP2r1k37epf4WMeS?cluster=devnet) |

## Through the web app (2026-10-02)

The same lifecycle again, this time entirely through the site's pages with a browser test wallet:
launch from the Launch page, buy on the problem page, then commit, upload, reveal, verify and claim
from the Solve page. All 32 transactions landed; every single-transaction step carried a compute
limit sized from its simulation.

| What | Address |
|---|---|
| Problem ⟨7×7×9 : ≤314⟩, token E2E779 (every transaction is listed on its page) | [`F3PEAEXP…`](https://explorer.solana.com/address/F3PEAEXPHqH8qvzenhM53QM5GZKrMsSjKN1bkTBZQLWS?cluster=devnet) |
| DBC pool | [`BY4RLfDA…`](https://explorer.solana.com/address/BY4RLfDAQes6YP3zq3LzT3hnCMV6r7Se45wsW4dgdUh5?cluster=devnet) |
| Solver (test wallet) | [`4QvhwY5n…`](https://explorer.solana.com/address/4QvhwY5nrjqJLMXYmKgAToHVqgFigiu1ZfJ9bqbWEajj?cluster=devnet) |

The run found four app bugs, fixed in the same change: a closed attempt reset the solve steps,
numbers followed the browser's locale, the wallet balance beside the amount read like a prefilled
amount, and the solve page called a problem solved while its own claim was still pending.
