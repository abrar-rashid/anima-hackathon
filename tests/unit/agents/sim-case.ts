import type { AssemblerInput } from '@/agents/schemas'

export const SIM_ASSEMBLER_INPUT: AssemblerInput = {
  patientId: 'SIM-000001',
  result: {
    id: 'blood-v1-SIM-000001-crp-5',
    version: 1,
    classification: {
      rule: 'source-reference-range',
      ruleText:
        'An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.',
      analyteId: 'crp',
      analyteName: 'C-reactive protein',
      value: 5.6,
      unit: 'mg/L',
      referenceLow: 0,
      referenceHigh: 5,
      direction: 'above',
    },
    visibleTo: ['gp', 'hospital', 'diagnostics'],
    owner: 'diagnostics',
  },
  records: [
    {
      id: 'discharge-summary-example',
      kind: 'discharge-summary',
      version: 1,
      title: 'Discharge summary · monitoring handover',
      status: 'sent',
      owner: 'hospital',
      visibleTo: ['hospital', 'gp'],
      site: 'gp',
    },
    {
      id: 'r-2',
      kind: 'task',
      version: 1,
      title: 'Arrange post-discharge monitoring',
      status: 'open',
      owner: 'gp',
      visibleTo: ['gp'],
      site: 'gp',
    },
  ],
  simulatorNow: 1789286400000,
}
