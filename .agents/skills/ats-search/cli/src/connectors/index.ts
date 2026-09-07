import type { AtsType, Company, ListOpts, Posting } from "../helpers.js";
import * as greenhouse from "./greenhouse.js";
import * as lever from "./lever.js";
import * as ashby from "./ashby.js";
import * as smartrecruiters from "./smartrecruiters.js";

export interface Connector {
  list(company: Company, opts: ListOpts): Promise<Posting[]>;
  getOne(company: Company, externalId: string): Promise<Posting | null>;
}

export const CONNECTORS: Record<AtsType, Connector> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
};
