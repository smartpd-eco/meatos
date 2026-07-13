export const SOURCE_REGISTRY = [
  {
    sourceId: "src-l1-mofa",
    sourceName: "농림축산식품부",
    sourceType: "government",
    organization: "농림축산식품부",
    authorityLevel: "L1",
    collectedAt: "2026-07-11T00:00:00.000Z",
    collector: "system",
    status: "active"
  },
  {
    sourceId: "src-l1-kape",
    sourceName: "축산물품질평가원",
    sourceType: "government",
    organization: "축산물품질평가원(KAPE)",
    authorityLevel: "L1",
    collectedAt: "2026-07-11T00:00:00.000Z",
    collector: "system",
    status: "active"
  },
  {
    sourceId: "src-l2-nonghyup",
    sourceName: "농협경제지주",
    sourceType: "association",
    organization: "농협경제지주",
    authorityLevel: "L2",
    collectedAt: "2026-07-11T00:00:00.000Z",
    collector: "system",
    status: "active"
  },
  {
    sourceId: "src-l5-good-chuksan",
    sourceName: "좋은축산",
    sourceType: "supplier",
    organization: "좋은축산",
    authorityLevel: "L5",
    collectedAt: "2026-07-11T00:00:00.000Z",
    collector: "PM",
    status: "active"
  }
];

export function summarizeAuthorityLevels(rows = SOURCE_REGISTRY) {
  return rows.reduce((acc, row) => {
    acc[row.authorityLevel] = (acc[row.authorityLevel] ?? 0) + 1;
    return acc;
  }, { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 });
}
