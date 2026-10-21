import { describe, expect, it } from "vitest";
import {
  documentAgeing,
  documentOutstanding,
  parseFils,
  postSettlement,
  reverseSettlement,
  settlementPosition,
  type PostedSettlement,
  type SettlementDocument,
} from "./settlement";

const documents: SettlementDocument[] = [
  {
    id: "INV-101",
    side: "receivable",
    partyId: "customer-a",
    issuedOn: "2026-01-01",
    dueOn: "2026-01-31",
    amountFils: 500_000n,
  },
  {
    id: "INV-102",
    side: "receivable",
    partyId: "customer-a",
    issuedOn: "2026-02-01",
    dueOn: "2026-02-28",
    amountFils: 300_000n,
  },
  {
    id: "INV-OTHER",
    side: "receivable",
    partyId: "customer-b",
    issuedOn: "2026-01-01",
    dueOn: "2026-01-31",
    amountFils: 100_000n,
  },
  {
    id: "BILL-101",
    side: "payable",
    partyId: "supplier-a",
    issuedOn: "2026-01-01",
    dueOn: "2026-01-15",
    amountFils: 80_000n,
  },
  {
    id: "BILL-102",
    side: "payable",
    partyId: "supplier-a",
    issuedOn: "2026-01-02",
    dueOn: "2026-02-15",
    amountFils: 40_000n,
  },
];

function receipt(
  id: string,
  amountFils: bigint,
  allocations: PostedSettlement["allocations"],
  overrides: Partial<PostedSettlement> = {},
): PostedSettlement {
  return {
    type: "posted",
    id,
    postingKey: `key-${id}`,
    side: "receivable",
    partyId: "customer-a",
    date: "2026-03-01",
    amountFils,
    allocations,
    ...overrides,
  };
}

describe("strict fils adapter", () => {
  it("accepts exact one- and two-decimal AED amounts without floating point", () => {
    expect(parseFils(" 6 ")).toBe(600n);
    expect(parseFils("5.2")).toBe(520n);
    expect(parseFils("0.01")).toBe(1n);
  });
  it.each(["-1", "1.001", "1e3", "1,000", "01.00", "", "NaN"])(
    "rejects unsupported money input %s",
    (input) => expect(() => parseFils(input)).toThrow(),
  );
});

describe("explicit customer allocations", () => {
  it("settles the newer selected invoice and keeps the older invoice ageing", () => {
    const payment = receipt("RCT-1", 300_000n, [
      { documentId: "INV-102", amountFils: 300_000n },
    ]);
    const events = postSettlement(documents, [], payment);
    expect(documentOutstanding(documents[0], events, "2026-03-01")).toBe(
      500_000n,
    );
    expect(documentOutstanding(documents[1], events, "2026-03-01")).toBe(0n);
    expect(documentAgeing(documents[0], events, "2026-03-01")).toMatchObject({
      outstandingFils: 500_000n,
      daysOverdue: 29,
      bucket: "1–30",
    });
  });

  it("supports split settlement, repeated partial payments and explicit advance balance", () => {
    const first = receipt("RCT-1", 400_000n, [
      { documentId: "INV-101", amountFils: 200_000n },
      { documentId: "INV-102", amountFils: 100_000n },
    ]);
    const events = postSettlement(documents, [], first);
    expect(settlementPosition(first, events, "2026-03-01")).toEqual({
      allocatedFils: 300_000n,
      unallocatedFils: 100_000n,
    });
    const second = receipt("RCT-2", 100_000n, [
      { documentId: "INV-101", amountFils: 100_000n },
    ]);
    const both = postSettlement(documents, events, second);
    expect(documentOutstanding(documents[0], both, "2026-03-01")).toBe(
      200_000n,
    );
    expect(documentOutstanding(documents[1], both, "2026-03-01")).toBe(
      200_000n,
    );
    const advance = receipt("RCT-3", 50_000n, []);
    const all = postSettlement(documents, both, advance);
    expect(settlementPosition(advance, all, "2026-03-01").unallocatedFils).toBe(
      50_000n,
    );
    expect(documentOutstanding(documents[0], all, "2026-03-01")).toBe(200_000n);
  });

  it("rejects cross-party, cross-ledger, duplicate and over-allocated selections", () => {
    const invalid = [
      receipt("r1", 1n, [{ documentId: "INV-OTHER", amountFils: 1n }]),
      receipt("r2", 1n, [{ documentId: "BILL-101", amountFils: 1n }]),
      receipt("r3", 2n, [
        { documentId: "INV-101", amountFils: 1n },
        { documentId: "INV-101", amountFils: 1n },
      ]),
      receipt("r4", 1n, [{ documentId: "INV-101", amountFils: 2n }]),
      receipt("r5", 500_001n, [
        { documentId: "INV-101", amountFils: 500_001n },
      ]),
      receipt("r6", 1n, [{ documentId: "missing", amountFils: 1n }]),
      receipt("r7", 1n, [{ documentId: "INV-101", amountFils: 0n }]),
    ];
    for (const payment of invalid)
      expect(() => postSettlement(documents, [], payment)).toThrow();
  });

  it("rejects repeated IDs and posting keys even after reversal", () => {
    const first = receipt("r1", 1n, []);
    const events = postSettlement(documents, [], first);
    expect(() => postSettlement(documents, events, first)).toThrow(/ID/);
    expect(() =>
      postSettlement(
        documents,
        events,
        receipt("r2", 1n, [], { postingKey: first.postingKey }),
      ),
    ).toThrow(/posting key/);
  });
});

describe("supplier bill allocations and immutable corrections", () => {
  it("allocates to specific supplier bills and measures each bill from its own due date", () => {
    const payment = receipt(
      "SP-1",
      60_000n,
      [
        { documentId: "BILL-101", amountFils: 30_000n },
        { documentId: "BILL-102", amountFils: 30_000n },
      ],
      { side: "payable", partyId: "supplier-a" },
    );
    const events = postSettlement(documents, [], payment);
    expect(documentAgeing(documents[3], events, "2026-03-01")).toMatchObject({
      outstandingFils: 50_000n,
      daysOverdue: 45,
      bucket: "31–60",
    });
    expect(documentAgeing(documents[4], events, "2026-03-01")).toMatchObject({
      outstandingFils: 10_000n,
      daysOverdue: 14,
      bucket: "1–30",
    });
  });

  it("reverses by appending an event, retaining historical as-of positions", () => {
    const payment = receipt("r1", 10_000n, [
      { documentId: "INV-101", amountFils: 10_000n },
    ]);
    const posted = postSettlement(documents, [], payment);
    const reversed = reverseSettlement(posted, {
      type: "reversed",
      id: "reverse-r1",
      settlementId: "r1",
      date: "2026-03-10",
      reason: "Bank correction",
    });
    expect(reversed).toHaveLength(2);
    expect(reversed[0]).toEqual(payment);
    expect(documentOutstanding(documents[0], reversed, "2026-03-09")).toBe(
      490_000n,
    );
    expect(documentOutstanding(documents[0], reversed, "2026-03-10")).toBe(
      500_000n,
    );
    expect(settlementPosition(payment, reversed, "2026-03-10")).toEqual({
      allocatedFils: 0n,
      unallocatedFils: 0n,
    });
    expect(() =>
      reverseSettlement(reversed, {
        type: "reversed",
        id: "again",
        settlementId: "r1",
        date: "2026-03-11",
        reason: "Duplicate",
      }),
    ).toThrow(/already reversed/);
  });

  it("does not reset overdue age after partial payment and uses calendar days", () => {
    const payment = receipt(
      "r1",
      10_000n,
      [{ documentId: "INV-101", amountFils: 10_000n }],
      { date: "2026-04-01" },
    );
    const events = postSettlement(documents, [], payment);
    expect(documentAgeing(documents[0], events, "2026-04-01")).toMatchObject({
      outstandingFils: 490_000n,
      daysOverdue: 60,
      bucket: "31–60",
    });
    expect(documentAgeing(documents[0], events, "2026-05-02").bucket).toBe(
      "90+",
    );
  });
});
