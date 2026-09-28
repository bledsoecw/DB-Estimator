/**
 * The slice of JobTread's Pave API this auditor reads.
 *
 * Field shapes were verified against organization 22PBAjem8SSC — see
 * docs/jobtread-api-field-notes.md. Numbers arrive as IEEE floats and are
 * converted to exact Money at the domain boundary (src/domain.ts), never used
 * for arithmetic in this shape.
 */

export interface Ref {
  id: string;
}

export interface NamedRef extends Ref {
  name: string;
}

/** Raw cost item as it comes off the wire. */
export interface ApiCostItem {
  id: string;
  name: string;
  quantity: number | null;
  unitCost: number | null;
  unitPrice: number | null;
  cost: number;
  price: number;
  isTaxable: boolean;
  isSelected: boolean;
  isSpecification: boolean;
  position: string | null;
  globalId: string | null;
  quantityFormula: string | null;
  unit: NamedRef | null;
  costType: NamedRef;
  costCode: NamedRef;
  costGroup: Ref | null;
  organizationCostItem: Ref | null;
}

export interface ApiCostGroup {
  id: string;
  name: string;
  position: string | null;
  isSelected: boolean;
  isSimpleSelection: boolean;
  minSelectionsRequired: number | null;
  maxSelectionsAllowed: number | null;
  showChildCosts: boolean;
  parentCostGroup: Ref | null;
}

export interface ApiDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  price: number;
  cost: number;
  priceWithTax: number;
  taxRate: number;
  taxName: string | null;
  externalId: string | null;
  showChildCosts: boolean;
  showQuantity: boolean;
  showProfit: boolean;
  showLinesAtDepth: number | null;
  requireSignature: boolean;
  includeInBudget: boolean;
  issueDate: string | null;
  createdAt: string;
  job: NamedRef;
  costGroups: { count: number; nodes: ApiCostGroup[] };
  costItems: { count: number; nodes: ApiCostItem[] };
}

/**
 * Cost types carry the org's markup policy.
 *
 * `margin` is a fraction: Materials 0.3103448275862069 (exactly x1.45), Labor
 * 0.45000549994500055, Subcontractor 0.3. Reading it live means a policy change
 * made in JobTread propagates with no code change here.
 */
export interface ApiCostType {
  id: string;
  name: string;
  margin: number | null;
  isTaxable: boolean;
  isTimeTrackable: boolean;
  isActive: boolean;
}

/** One comparable job for the margin band. */
export interface ApiComparable {
  price: number;
  cost: number;
  job: { name: string };
}

/** A captured fixture: everything one audit needs, frozen to disk. */
export interface AuditFixture {
  capturedAt: string;
  organizationId: string;
  document: ApiDocument;
  costTypes: ApiCostType[];
  comparables: ApiComparable[];
}
