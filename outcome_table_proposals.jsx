import React, { useState } from 'react';

const OutcomeTableProposals = () => {
  const [selectedTable, setSelectedTable] = useState(null);

  // Table A: "Slot Machine" - High volatility, classic feel
  const tableA = {
    name: "Table A: Slot Machine",
    subtitle: "High volatility, classic casino feel",
    outcomes: [
      { result: "0x (Total Loss)", probability: 0.45, multiplier: 0, contribution: 0 },
      { result: "0.5x (Half Back)", probability: 0.25, multiplier: 0.5, contribution: 0.125 },
      { result: "1x (Push)", probability: 0.15, multiplier: 1.0, contribution: 0.15 },
      { result: "2x (Double)", probability: 0.10, multiplier: 2.0, contribution: 0.20 },
      { result: "5x (Big Win)", probability: 0.04, multiplier: 5.0, contribution: 0.20 },
      { result: "10x (Jackpot)", probability: 0.01, multiplier: 10.0, contribution: 0.10 },
    ],
    color: "red"
  };

  // Table B: "Grinder" - Lower volatility, more frequent returns
  const tableB = {
    name: "Table B: Grinder",
    subtitle: "Lower volatility, more frequent small wins",
    outcomes: [
      { result: "0x (Total Loss)", probability: 0.35, multiplier: 0, contribution: 0 },
      { result: "0.25x (Quarter)", probability: 0.15, multiplier: 0.25, contribution: 0.0375 },
      { result: "0.5x (Half Back)", probability: 0.20, multiplier: 0.5, contribution: 0.10 },
      { result: "1x (Push)", probability: 0.15, multiplier: 1.0, contribution: 0.15 },
      { result: "1.5x (Small Win)", probability: 0.08, multiplier: 1.5, contribution: 0.12 },
      { result: "2x (Double)", probability: 0.05, multiplier: 2.0, contribution: 0.10 },
      { result: "3x (Triple)", probability: 0.015, multiplier: 3.0, contribution: 0.045 },
      { result: "8x (Big Win)", probability: 0.005, multiplier: 8.0, contribution: 0.04 },
    ],
    color: "blue"
  };

  // Table C: "Balanced" - Moderate volatility, balanced experience
  const tableC = {
    name: "Table C: Balanced",
    subtitle: "Moderate volatility, recommended for launch",
    outcomes: [
      { result: "0x (Total Loss)", probability: 0.40, multiplier: 0, contribution: 0 },
      { result: "0.5x (Half Back)", probability: 0.22, multiplier: 0.5, contribution: 0.11 },
      { result: "1x (Push)", probability: 0.18, multiplier: 1.0, contribution: 0.18 },
      { result: "1.5x (Small Win)", probability: 0.10, multiplier: 1.5, contribution: 0.15 },
      { result: "2x (Double)", probability: 0.06, multiplier: 2.0, contribution: 0.12 },
      { result: "4x (Quad)", probability: 0.03, multiplier: 4.0, contribution: 0.12 },
      { result: "10x (Jackpot)", probability: 0.01, multiplier: 10.0, contribution: 0.10 },
    ],
    color: "green"
  };

  const tables = [tableA, tableB, tableC];

  const calculateEV = (table) => {
    return table.outcomes.reduce((sum, o) => sum + o.contribution, 0);
  };

  const calculateHouseEdge = (table) => {
    return ((1 - calculateEV(table)) * 100).toFixed(2);
  };

  const calculateLossRate = (table) => {
    const lossOutcome = table.outcomes.find(o => o.multiplier === 0);
    return lossOutcome ? (lossOutcome.probability * 100).toFixed(0) : 0;
  };

  const calculateWinRate = (table) => {
    return (table.outcomes.filter(o => o.multiplier > 1).reduce((sum, o) => sum + o.probability, 0) * 100).toFixed(0);
  };

  const colorMap = {
    red: { bg: "bg-red-50", border: "border-red-400", header: "bg-red-100", text: "text-red-700" },
    blue: { bg: "bg-blue-50", border: "border-blue-400", header: "bg-blue-100", text: "text-blue-700" },
    green: { bg: "bg-green-50", border: "border-green-400", header: "bg-green-100", text: "text-green-700" }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-center mb-2">Treasure Hunt: Outcome Table Proposals</h1>
      <p className="text-center text-gray-600 mb-8">Select one table to use as the immutable outcome distribution</p>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {tables.map((table, idx) => {
          const colors = colorMap[table.color];
          return (
            <div
              key={idx}
              className={`${colors.bg} ${colors.border} border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${selectedTable === idx ? 'ring-4 ring-offset-2 ring-gray-400' : ''}`}
              onClick={() => setSelectedTable(idx)}
            >
              <h3 className={`font-bold text-lg ${colors.text}`}>{table.name}</h3>
              <p className="text-sm text-gray-600 mb-3">{table.subtitle}</p>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white rounded p-2">
                  <div className="text-gray-500">House Edge</div>
                  <div className="font-bold text-lg">{calculateHouseEdge(table)}%</div>
                </div>
                <div className="bg-white rounded p-2">
                  <div className="text-gray-500">0x Rate</div>
                  <div className="font-bold text-lg">{calculateLossRate(table)}%</div>
                </div>
                <div className="bg-white rounded p-2">
                  <div className="text-gray-500">Win Rate</div>
                  <div className="font-bold text-lg">{calculateWinRate(table)}%</div>
                </div>
                <div className="bg-white rounded p-2">
                  <div className="text-gray-500">EV per $1</div>
                  <div className="font-bold text-lg">${calculateEV(table).toFixed(3)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed Tables */}
      <div className="space-y-6">
        {tables.map((table, idx) => {
          const colors = colorMap[table.color];
          return (
            <div key={idx} className={`${colors.bg} ${colors.border} border-2 rounded-lg overflow-hidden`}>
              <div className={`${colors.header} px-4 py-3`}>
                <h3 className={`font-bold ${colors.text}`}>{table.name}</h3>
              </div>
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Outcome</th>
                      <th className="text-right py-2">Probability</th>
                      <th className="text-right py-2">Multiplier</th>
                      <th className="text-right py-2">EV Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.outcomes.map((outcome, oidx) => (
                      <tr key={oidx} className={`border-b border-gray-200 ${outcome.multiplier === 0 ? 'bg-red-100' : outcome.multiplier > 1 ? 'bg-green-50' : ''}`}>
                        <td className="py-2 font-medium">{outcome.result}</td>
                        <td className="text-right py-2">{(outcome.probability * 100).toFixed(1)}%</td>
                        <td className="text-right py-2">{outcome.multiplier}x</td>
                        <td className="text-right py-2">${outcome.contribution.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td className="py-2">TOTAL</td>
                      <td className="text-right py-2">100%</td>
                      <td className="text-right py-2">-</td>
                      <td className="text-right py-2">${calculateEV(table).toFixed(4)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tradeoffs Analysis */}
      <div className="mt-8 bg-white border-2 border-gray-300 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Tradeoff Analysis</h2>

        <div className="space-y-4">
          <div className="border-l-4 border-red-400 pl-4">
            <h4 className="font-bold text-red-700">Table A: Slot Machine</h4>
            <p className="text-sm text-gray-700">
              <strong>Pros:</strong> Highest 0x rate (45%) = fastest Treasure growth + most $HUNT emissions.
              Big 10x jackpot creates exciting moments. Classic casino feel.
            </p>
            <p className="text-sm text-gray-700">
              <strong>Cons:</strong> Highest house edge (22.5%) may feel punishing.
              Lower win frequency could discourage casual players.
            </p>
            <p className="text-sm text-gray-600 italic">
              Best for: Players who want high stakes, fast action, maximum Treasure funding.
            </p>
          </div>

          <div className="border-l-4 border-blue-400 pl-4">
            <h4 className="font-bold text-blue-700">Table B: Grinder</h4>
            <p className="text-sm text-gray-700">
              <strong>Pros:</strong> Lowest house edge (7.75%) = most player-friendly.
              8 different outcomes = high variety. Most sustainable for long sessions.
            </p>
            <p className="text-sm text-gray-700">
              <strong>Cons:</strong> Lowest 0x rate (35%) = slowest Treasure growth.
              Lower $HUNT emission rate. May feel "too safe" for thrill-seekers.
            </p>
            <p className="text-sm text-gray-600 italic">
              Best for: Players who want extended play sessions, lower risk tolerance.
            </p>
          </div>

          <div className="border-l-4 border-green-400 pl-4">
            <h4 className="font-bold text-green-700">Table C: Balanced (Recommended)</h4>
            <p className="text-sm text-gray-700">
              <strong>Pros:</strong> 40% 0x rate balances Treasure funding with player experience.
              12% house edge is competitive with slots. 7 outcomes provide variety without complexity.
            </p>
            <p className="text-sm text-gray-700">
              <strong>Cons:</strong> "Jack of all trades" - may not appeal to extremes.
              Less distinctive personality than A or B.
            </p>
            <p className="text-sm text-gray-600 italic">
              Best for: Broad audience appeal, sustainable game economics, recommended for launch.
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-300 rounded">
          <h4 className="font-bold text-yellow-800">My Recommendation: Table C (Balanced)</h4>
          <p className="text-sm text-yellow-900">
            For an autonomous, immutable system, Table C offers the best risk/reward balance:
            40% loss rate generates healthy Treasure growth while 12% house edge keeps players engaged.
            The 10x jackpot maintains excitement without extreme volatility.
            You can always launch a "high roller" variant later with Table A parameters.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OutcomeTableProposals;
