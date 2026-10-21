/**
 * Browser-demo custody model. It is a pure, unposted transaction register:
 * transfers move money only; purchases reference one external cost record.
 */
export type CustodyAccountKind = "bank" | "cash" | "staff-holder";

export interface CustodyAccount {
  id: string;
  name: string;
  kind: CustodyAccountKind;
  holderId?: string;
  currency: "AED";
}

export interface CustodyOpeningBalance {
  accountId: string;
  amountFils: string;
}

interface TransactionBase {
  id: string;
  date: string;
  amountFils: string;
  reference: string;
  recordedBy: string;
}

export interface CustodyTransfer extends TransactionBase {
  kind: "transfer";
  fromAccountId: string;
  toAccountId: string;
}

export interface CustodyPurchase extends TransactionBase {
  kind: "purchase";
  fromAccountId: string;
  /** Stable ID of the one cost document/submission this cash purchase pays. */
  costId: string;
  projectId?: string;
}

export type CustodyTransaction = CustodyTransfer | CustodyPurchase;

export interface CustodyState {
  version: 1;
  accounts: readonly CustodyAccount[];
  /** Synthetic fixture only: opening balances require an approved migration policy. */
  openingBalances: readonly CustodyOpeningBalance[];
  transactions: readonly CustodyTransaction[];
}

export interface CustodyStatementLine {
  transactionId: string;
  date: string;
  kind: CustodyTransaction["kind"];
  reference: string;
  movementFils: string;
  balanceFils: string;
  costId?: string;
}

function required(value: string, label: string) {
  if (!value?.trim()) throw Error(`${label} is required.`);
}

function positiveFils(value: string) {
  if (!/^[1-9]\d*$/.test(value))
    throw Error("Custody transaction amount must be positive integer fils.");
  return BigInt(value);
}

function nonnegativeFils(value: string) {
  if (!/^(0|[1-9]\d*)$/.test(value))
    throw Error("Opening balance must be nonnegative integer fils.");
  return BigInt(value);
}

function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw Error("Custody date must use YYYY-MM-DD.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw Error("Custody date must be a real calendar date.");
}

function account(state: CustodyState, id: string) {
  const found = state.accounts.find((item) => item.id === id);
  if (!found) throw Error(`Unknown custody account: ${id}.`);
  return found;
}

export function createCustodyState(
  accounts: readonly CustodyAccount[],
  openingBalances: readonly CustodyOpeningBalance[],
): CustodyState {
  const ids = new Set<string>();
  for (const item of accounts) {
    required(item.id, "Account ID");
    required(item.name, "Account name");
    if (ids.has(item.id)) throw Error("Custody account IDs must be unique.");
    if (
      !["bank", "cash", "staff-holder"].includes(item.kind) ||
      item.currency !== "AED"
    )
      throw Error(
        "Custody accounts require an approved kind and AED currency.",
      );
    if (item.kind === "staff-holder")
      required(item.holderId || "", "Cash holder");
    else if (item.holderId)
      throw Error("Only staff-holder accounts may name a cash holder.");
    ids.add(item.id);
  }
  const openings = new Set<string>();
  for (const item of openingBalances) {
    if (!ids.has(item.accountId))
      throw Error("Opening balance needs an existing account.");
    if (openings.has(item.accountId))
      throw Error("Opening balance account is duplicated.");
    nonnegativeFils(item.amountFils);
    openings.add(item.accountId);
  }
  return {
    version: 1,
    accounts: accounts.map((item) => ({ ...item })),
    openingBalances: openingBalances.map((item) => ({ ...item })),
    transactions: [],
  };
}

/** A transfer is never cost or income, even when the destination is a person. */
export function transactionClassification(transaction: CustodyTransaction) {
  return {
    cashMovementFils: transaction.amountFils,
    /** Cash paid for a linked purchase, not a VAT or P&L expense posting. */
    purchaseOutflowFils:
      transaction.kind === "purchase" ? transaction.amountFils : "0",
    isInternalTransfer: transaction.kind === "transfer",
  };
}

export function custodyBalanceFils(
  state: CustodyState,
  accountId: string,
): string {
  account(state, accountId);
  let balance = nonnegativeFils(
    state.openingBalances.find((item) => item.accountId === accountId)
      ?.amountFils || "0",
  );
  for (const tx of state.transactions) {
    const amount = positiveFils(tx.amountFils);
    if (tx.fromAccountId === accountId) balance -= amount;
    if (tx.kind === "transfer" && tx.toAccountId === accountId)
      balance += amount;
  }
  return balance.toString();
}

export function custodyPurchaseOutflowFils(state: CustodyState): string {
  return state.transactions
    .filter((tx): tx is CustodyPurchase => tx.kind === "purchase")
    .reduce((sum, tx) => sum + positiveFils(tx.amountFils), 0n)
    .toString();
}

/** Opening plus account balances equals opening less purchase cash; transfers cancel. */
export function custodyReconciliation(state: CustodyState) {
  const openingFils = state.openingBalances.reduce(
    (sum, item) => sum + nonnegativeFils(item.amountFils),
    0n,
  );
  const closingFils = state.accounts.reduce(
    (sum, item) => sum + BigInt(custodyBalanceFils(state, item.id)),
    0n,
  );
  const purchaseOutflowFils = BigInt(custodyPurchaseOutflowFils(state));
  return {
    openingFils: openingFils.toString(),
    closingFils: closingFils.toString(),
    purchaseOutflowFils: purchaseOutflowFils.toString(),
    differenceFils: (
      openingFils -
      purchaseOutflowFils -
      closingFils
    ).toString(),
    balanced: openingFils - purchaseOutflowFils === closingFils,
  };
}

function append(
  state: CustodyState,
  transaction: CustodyTransaction,
): CustodyState {
  required(transaction.id, "Transaction ID");
  required(transaction.reference, "Transaction reference");
  required(transaction.recordedBy, "Recorded by");
  date(transaction.date);
  const amount = positiveFils(transaction.amountFils);
  account(state, transaction.fromAccountId);
  if (transaction.kind === "transfer") {
    account(state, transaction.toAccountId);
    if (transaction.fromAccountId === transaction.toAccountId)
      throw Error("Transfer source and destination must differ.");
  } else {
    required(transaction.costId, "Purchase cost ID");
    if (
      state.transactions.some(
        (tx) =>
          tx.kind === "purchase" &&
          tx.costId === transaction.costId &&
          tx.id !== transaction.id,
      )
    )
      throw Error(
        "A cost cannot be paid twice through the custody purchase route.",
      );
  }
  const previous = state.transactions.find((tx) => tx.id === transaction.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(transaction))
      throw Error("Transaction ID was already used for different content.");
    return state;
  }
  if (BigInt(custodyBalanceFils(state, transaction.fromAccountId)) < amount)
    throw Error("Custody account has insufficient available balance.");
  return {
    ...state,
    transactions: [...state.transactions, { ...transaction }],
  };
}

export function transferCustody(
  state: CustodyState,
  input: CustodyTransfer,
): CustodyState {
  if (input.kind !== "transfer") throw Error("Expected an internal transfer.");
  return append(state, input);
}

export function recordCustodyPurchase(
  state: CustodyState,
  input: CustodyPurchase,
): CustodyState {
  if (input.kind !== "purchase") throw Error("Expected a linked purchase.");
  return append(state, input);
}

export function custodyStatement(
  state: CustodyState,
  accountId: string,
): CustodyStatementLine[] {
  account(state, accountId);
  let balance = BigInt(
    state.openingBalances.find((item) => item.accountId === accountId)
      ?.amountFils || "0",
  );
  const lines: CustodyStatementLine[] = [];
  for (const tx of state.transactions) {
    let movement = 0n;
    if (tx.fromAccountId === accountId) movement -= BigInt(tx.amountFils);
    if (tx.kind === "transfer" && tx.toAccountId === accountId)
      movement += BigInt(tx.amountFils);
    if (movement === 0n) continue;
    balance += movement;
    lines.push({
      transactionId: tx.id,
      date: tx.date,
      kind: tx.kind,
      reference: tx.reference,
      movementFils: movement.toString(),
      balanceFils: balance.toString(),
      ...(tx.kind === "purchase" ? { costId: tx.costId } : {}),
    });
  }
  return lines;
}
