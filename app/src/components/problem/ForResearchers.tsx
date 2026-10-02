import { TOLL } from "@meteortoll/core";
import type { ProblemView } from "@/lib/chain";
import { explorer } from "@/lib/config";
import { More, Panel } from "../ui";

export function ForResearchers({ problem }: { problem: ProblemView }) {
  const rows: [string, string][] = [
    ["Program", TOLL.toBase58()],
    ["Problem", problem.address],
    ["DBC pool", problem.account.pool.toBase58()],
    ["Token mint", problem.account.baseMint.toBase58()],
    ["Bounty vault", problem.account.quoteVault.toBase58()],
  ];
  return (
    <Panel className="p-5">
      <h2 className="mb-2 font-medium">For researchers</h2>
      <More label="Addresses and scheme format">
        <p className="mb-3 text-sm text-muted">
          Submit an <span className="font-mono">fmm</span> JSON scheme with
          fields <span className="font-mono">n, u, v, w</span>:{" "}
          <span className="font-mono">u</span> indexes A[i][j] as i·m+j,{" "}
          <span className="font-mono">v</span> indexes B[j][k] as j·p+k, and{" "}
          <span className="font-mono">w</span> indexes the transposed output as
          k·n+i. Check it locally on the Solve page first.
        </p>
        <dl className="grid gap-1.5 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-2">
              <dt className="text-muted">{label}</dt>
              <dd className="truncate font-mono">
                <a
                  className="hover:underline"
                  href={explorer("address", value)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {value}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </More>
    </Panel>
  );
}
