import type { Database } from "../domain/model";
import type { DependencyLink, NodeRef } from "./model";

export const nodeKey = (node: NodeRef) => `${node.kind}:${node.id}`;
export function validateLinks(db: Database, projectId: string, links: DependencyLink[]): NodeRef[] {
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw Error("Planning project not found.");
  const nodes: NodeRef[] = [
    ...db.tasks.filter((t) => t.projectId === projectId).map((t) => ({ kind: "task" as const, id: t.id })),
    ...db.milestones.filter((m) => m.projectId === projectId).map((m) => ({ kind: "milestone" as const, id: m.id })),
  ];
  const known = new Set(nodes.map(nodeKey));
  const ids = new Set<string>(), pairs = new Set<string>();
  for (const link of links) {
    if (!link.id || ids.has(link.id) || link.projectId !== projectId ||
        !["FS", "SS", "FF", "SF"].includes(link.type) || !Number.isInteger(link.lagWorkingDays))
      throw Error("Planning dependency ID, project, type or working-day offset is invalid.");
    ids.add(link.id);
    const before = nodeKey(link.predecessor), after = nodeKey(link.successor);
    if (!known.has(before) || !known.has(after) || before === after)
      throw Error("Planning dependency has a missing, cross-project or self endpoint.");
    const pair = `${before}>${after}`;
    if (pairs.has(pair)) throw Error("Planning dependency endpoints are duplicated; revise the existing link.");
    pairs.add(pair);
  }
  const incoming = new Map(nodes.map((node) => [nodeKey(node), 0]));
  const outgoing = new Map(nodes.map((node) => [nodeKey(node), [] as string[]]));
  for (const link of links) {
    const before = nodeKey(link.predecessor), after = nodeKey(link.successor);
    incoming.set(after, incoming.get(after)! + 1);
    outgoing.get(before)!.push(after);
  }
  const ordered: NodeRef[] = [];
  const byKey = new Map(nodes.map((node) => [nodeKey(node), node]));
  const ready = [...incoming].filter(([, n]) => n === 0).map(([key]) => key).sort();
  while (ready.length) {
    const key = ready.shift()!;
    ordered.push(byKey.get(key)!);
    for (const after of outgoing.get(key)!.sort()) {
      incoming.set(after, incoming.get(after)! - 1);
      if (incoming.get(after) === 0) {
        ready.push(after);
        ready.sort();
      }
    }
  }
  if (ordered.length !== nodes.length) throw Error("Planning dependency graph contains a cycle.");
  return ordered;
}

export function reachableSuccessors(links: DependencyLink[], initiatingNode: NodeRef): Set<string> {
  const reached = new Set<string>();
  const visit = (node: NodeRef) => {
    for (const link of links.filter((candidate) => nodeKey(candidate.predecessor) === nodeKey(node))) {
      const key = nodeKey(link.successor);
      if (!reached.has(key)) { reached.add(key); visit(link.successor); }
    }
  };
  visit(initiatingNode);
  return reached;
}
