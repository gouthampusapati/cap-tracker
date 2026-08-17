const FAC_API_BASE = 'https://www.fac.gov/api/';

interface FACGeneralInfo {
  auditee_name: string;
  ein: string;
  fiscal_year_end_date: string;
  report_id: string;
}

interface FACFinding {
  reference_number: string;
  finding_text: string;
  questioned_costs?: number;
  repeat_finding?: boolean;
  prior_finding_references?: string[];
  type_requirement?: string;
}

export async function fetchFACOrgData(ein: string) {
  try {
    const apiKey = process.env.FAC_API_KEY;

    // Search for org by EIN
    const searchUrl = `${FAC_API_BASE}general/?ein=${ein}`;
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('FAC API error:', error);
    return null;
  }
}

export async function fetchFACFindings(auditYearId: string) {
  try {
    const apiKey = process.env.FAC_API_KEY;

    const url = `${FAC_API_BASE}findings/?audit_year=${auditYearId}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('FAC Findings API error:', error);
    return [];
  }
}

// Mock data for development/fallback
export function getMockAuditData(ein: string) {
  return {
    results: [
      {
        id: 1,
        auditee_name: 'Sample Organization',
        ein,
        fiscal_year_end_date: '2024-06-30',
        report_id: 'FAC-2024-001',
      },
    ],
  };
}

export function getMockFindings() {
  return [
    {
      reference_number: '2024-001',
      finding_text: 'Lack of adequate documentation for procurement activities',
      questioned_costs: 5000,
      repeat_finding: false,
      type_requirement: 'Procurement',
    },
    {
      reference_number: '2024-002',
      finding_text: 'Inadequate subrecipient monitoring',
      questioned_costs: 10000,
      repeat_finding: true,
      prior_finding_references: ['2023-001'],
      type_requirement: 'Subrecipient Monitoring',
    },
  ];
}
