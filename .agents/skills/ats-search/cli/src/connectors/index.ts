import type { AtsType, Company, Posting } from "../helpers.js";
import * as greenhouse from "./greenhouse.js";
import * as lever from "./lever.js";
import * as ashby from "./ashby.js";

export interface Connector {
  list(company: Company): Promise<Posting[]>;
  getOne(company: Company, externalId: string): Promise<Posting | null>;
}

export const CONNECTORS: Record<AtsType, Connector> = { greenhouse, lever, ashby };
