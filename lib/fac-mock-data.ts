/**
 * Mock FAC data for development/testing
 * Replace with real FAC API calls in production
 */

export interface MockFinding {
  facFindingId: string;
  auditYear: string;
  category: string;
  description: string;
  questionedCosts?: number;
  isRepeatFinding: boolean;
  priorRefs: string[];
}

/**
 * Sample findings from FAC for EIN 471334206
 * Based on real Single Audit structure
 */
export const mockFindings: MockFinding[] = [
  {
    facFindingId: "2024-001",
    auditYear: "2024-06-30",
    category: "Cash Management",
    description:
      "The organization did not maintain adequate supporting documentation for cash disbursements. Testing of 25 transactions revealed 5 instances where vendor invoices were missing or incomplete. This resulted in questioned costs of $12,500 related to travel and equipment purchases that could not be substantiated.",
    questionedCosts: 12500,
    isRepeatFinding: false,
    priorRefs: [],
  },
  {
    facFindingId: "2024-002",
    auditYear: "2024-06-30",
    category: "Procurement",
    description:
      "Procurement procedures were not followed for 3 purchases exceeding $25,000. The organization did not obtain competitive bids or maintain competitive procurement documentation as required by federal regulations. Total questioned costs: $45,000.",
    questionedCosts: 45000,
    isRepeatFinding: true,
    priorRefs: ["2023-003"],
  },
  {
    facFindingId: "2024-003",
    auditYear: "2024-06-30",
    category: "Subrecipient Monitoring",
    description:
      "The organization failed to adequately monitor a subrecipient's use of federal funds. Specifically: (1) No site visits were conducted during the year; (2) Subrecipient's single audit report was not reviewed for compliance; (3) Questioned costs of $8,750 were not identified or resolved by the subrecipient.",
    questionedCosts: 8750,
    isRepeatFinding: false,
    priorRefs: [],
  },
  {
    facFindingId: "2024-004",
    auditYear: "2024-06-30",
    category: "Cost Allowability",
    description:
      "Salary expenses charged to federal programs did not have adequate time tracking documentation. Employees working on federal grants were not completing timesheets showing allocation of time to grant activities. This resulted in $22,100 of salary costs that could not be traced to specific federal programs.",
    questionedCosts: 22100,
    isRepeatFinding: true,
    priorRefs: ["2023-001", "2022-002"],
  },
  {
    facFindingId: "2024-005",
    auditYear: "2024-06-30",
    category: "Reporting",
    description:
      "The Schedule of Expenditures of Federal Awards (SEFA) contained arithmetic errors totaling $5,400 in overstatement of federal grant expenditures. Additionally, one federal program was omitted from the SEFA that received $67,000 in federal funds. These errors required restatement.",
    questionedCosts: 0,
    isRepeatFinding: false,
    priorRefs: [],
  },
];

/**
 * Sample from prior year (2023) for repeat-finding comparison
 */
export const mockFindingsPriorYear: MockFinding[] = [
  {
    facFindingId: "2023-001",
    auditYear: "2023-06-30",
    category: "Cost Allowability",
    description: "Salary expenses lacked time tracking documentation",
    questionedCosts: 18900,
    isRepeatFinding: false,
    priorRefs: [],
  },
  {
    facFindingId: "2023-003",
    auditYear: "2023-06-30",
    category: "Procurement",
    description: "Competitive procurement procedures not followed for 2 purchases",
    questionedCosts: 38000,
    isRepeatFinding: false,
    priorRefs: [],
  },
];
