import type { FactInput } from "../provenance/types";

export interface ConnectorResult {
  connector: string;
  facts: FactInput[];
  /** Records too granular to be facts (individual votes, purchase orders); stored for the explorers and agents. */
  records?: Record<string, unknown[]>;
  /** Problems found while parsing or reconciling. A connector with issues does not overwrite the store. */
  issues: string[];
  notes: string[];
}

export interface Connector {
  id: string;
  description: string;
  /** Environment variables required to run. */
  requires?: string[];
  /** Alternative credential sets: the connector runs if every variable of at least one set is present. */
  requiresAnyOf?: string[][];
  run(opts: { year: number }): Promise<ConnectorResult>;
}
