import type { EhrBundle } from "@/lib/types";

/**
 * Synthetic longitudinal record for the demo patient, assembled from FIVE
 * separate source systems that do not talk to each other. That fragmentation
 * is the point: every object below carries its own `system` so the UI can
 * show which silo each fact came from.
 *
 * Nothing here is real patient data.
 */

export const SIM_START = "2026-09-11T08:00:00Z";
export const DISCHARGE_AT = "2026-09-08T16:40:00Z";

const DISCHARGE_BODY = `ROYAL LONDON HOSPITAL - BARTS HEALTH NHS TRUST
ELECTRONIC DISCHARGE SUMMARY

Patient: KHATUN, Amira (Mrs)   NHS: 943 476 5919   DOB: 12/02/1958
Ward: 12D Respiratory        Consultant: Dr H Bassey
Admitted: 03/09/2026 02:14   Discharged: 08/09/2026 16:40

DIAGNOSES
1. Community acquired pneumonia, right lower lobe (CURB-65 2 on admission)
2. New atrial fibrillation, first documented 03/09/2026. CHA2DS2-VASc 4.
3. Acute kidney injury stage 1, on a background of CKD 3a

CLINICAL COURSE
Mrs Khatun presented with four days of productive cough, fever and increasing
breathlessness. CXR confirmed right lower lobe consolidation. Blood cultures were
taken on admission before antibiotics. She was commenced on IV co-amoxiclav and
stepped down to oral amoxicillin on 04/09. Admission ECG showed atrial
fibrillation at 128bpm, rate controlled with bisoprolol. She was anticoagulated
with apixaban after discussion. Creatinine rose from a baseline of 92 to 148
(eGFR 32) during admission, felt to be pre-renal. Ramipril was held. She was
clinically improving and saturating 95% on air at discharge, mobilising with a
stick, and keen to go home.

ACTIONS FOR PRIMARY CARE AND COMMUNITY SERVICES
- Blood cultures from 03/09 were still pending at the time of discharge. Please
  chase the blood culture result and if the organism is resistant to amoxicillin
  the antibiotic will need to be changed.
- Please repeat U&E in 7 days. Her apixaban dose must be reviewed in light of
  renal function once the repeat result is available.
- Ramipril has been HELD on discharge because of the AKI. Please review whether
  to restart it after the repeat bloods.
- The CXR report was addended on 07/09 and notes an 8mm nodule in the right
  lower lobe, separate to the consolidation. This needs a CT thorax follow up
  arranged per BTS guidance. Please refer.
- Community nursing to review at home within 48 hours of discharge. She lives
  alone, is frail and this is her first time on an anticoagulant.
- Telephone follow up in 72 hours to check her breathlessness and that she is
  taking the apixaban correctly.

DISCHARGE MEDICATION
amoxicillin 500mg three times daily - complete course, last dose 11/09
apixaban 5mg twice daily - NEW, indefinite
bisoprolol 2.5mg once daily - NEW
metformin 500mg twice daily - unchanged
atorvastatin 20mg at night - unchanged
ramipril 5mg once daily - HELD, see above

Prepared by Dr T Reilly, Medical Registrar, 08/09/2026 16:40`;

const GP_FILING_NOTE = `Discharge summary received via GP Connect and filed. Skim read.
Pneumonia + new AF, now on apixaban. Have added to the recall list. Have not had
a chance to action the individual requests, will need a med review slot. Note she
has a repeat for naproxen which looks like it is still running.
- Dr P Nandakumar, 09/09/2026 08:14`;

export const AMIRA: EhrBundle = {
  episode_id: "EPI-2026-0844",
  discharge_at: DISCHARGE_AT,
  patient: {
    id: "PAT-KHATUN-A",
    nhs_number: "943 476 5919",
    name: "Amira Khatun",
    dob: "1958-02-12",
    age: 68,
    sex: "Female",
    address: "Flat 42, Ranwell House, Bow, London E3 2RT",
    phone: "+44 7700 900142",
    language: "Bengali (Sylheti) first language, conversational English",
    lives_alone: true,
    gp_practice: "Bromley-by-Bow Health Centre",
    flags: [
      "Lives alone",
      "Frailty score 5 (mildly frail)",
      "First anticoagulant",
      "Interpreter may be required",
    ],
  },

  actors: [
    {
      id: "ACT-REILLY",
      name: "Dr Tom Reilly",
      role: "Medical Registrar",
      org: "Royal London Hospital",
      lane: "hospital",
      available: false, // rotated to a different post on 09/09 - this is why the result orphaned
      authorised_for: ["act_on_results", "prescribe"],
    },
    {
      id: "ACT-OMONDI",
      name: "Sister Grace Omondi",
      role: "Discharge Coordinator",
      org: "Royal London Hospital",
      lane: "hospital",
      available: true,
      authorised_for: ["route_documents"],
    },
    {
      id: "ACT-ONCALL-REG",
      name: "Dr Yusuf Karim",
      role: "On-call Medical Registrar",
      org: "Royal London Hospital",
      lane: "hospital",
      available: true,
      authorised_for: ["act_on_results", "prescribe"],
    },
    {
      id: "ACT-NANDAKUMAR",
      name: "Dr Priya Nandakumar",
      role: "GP Partner",
      org: "Bromley-by-Bow Health Centre",
      lane: "gp",
      available: true,
      authorised_for: ["act_on_results", "prescribe", "refer"],
    },
    {
      id: "ACT-ADEYEMI",
      name: "Dr Samuel Adeyemi",
      role: "Duty GP",
      org: "Bromley-by-Bow Health Centre",
      lane: "gp",
      available: true,
      authorised_for: ["act_on_results", "prescribe", "refer"],
    },
    {
      id: "ACT-PATEL",
      name: "Raj Patel",
      role: "Community Pharmacist",
      org: "Boots, Whitechapel Road",
      lane: "pharmacy",
      available: true,
      authorised_for: ["medicines_reconciliation", "dispense"],
    },
    {
      id: "ACT-CHUKWU",
      name: "Ifeoma Chukwu",
      role: "PCN Clinical Pharmacist",
      org: "Tower Hamlets PCN",
      lane: "pharmacy",
      available: true,
      authorised_for: ["medicines_reconciliation", "prescribe"],
    },
    {
      id: "ACT-COMMUNITY-UNKNOWN",
      name: "Unassigned",
      role: "Community Nurse",
      org: "Tower Hamlets Community Health Services",
      lane: "community",
      available: false,
      authorised_for: [],
    },
    {
      id: "ACT-OBI",
      name: "Nneka Obi",
      role: "Neighbourhood Team Coordinator",
      org: "Tower Hamlets Neighbourhood Team",
      lane: "community",
      available: true,
      authorised_for: ["referral_routing", "request_access"],
    },
    {
      id: "ACT-AGENT",
      name: "CareClosure Agent",
      role: "Automated follow-up",
      org: "CareClosure",
      lane: "home",
      available: true,
      authorised_for: ["patient_contact"],
    },
    {
      id: "ACT-PATIENT",
      name: "Amira Khatun",
      role: "Patient",
      org: "Home",
      lane: "home",
      available: true,
      authorised_for: [],
    },
  ],

  documents: [
    {
      id: "DOC-EDS-0844",
      system: "Barts Health EPR (Cerner Millennium)",
      type: "eDischarge summary",
      authored_at: DISCHARGE_AT,
      author_id: "ACT-REILLY",
      title: "Electronic discharge summary - EPI-2026-0844",
      body: DISCHARGE_BODY,
      sent_to: [
        {
          org: "Bromley-by-Bow Health Centre",
          at: "2026-09-08T17:02:00Z",
          channel: "GP Connect / MESH",
        },
      ],
      filed_by: { actor_id: "ACT-NANDAKUMAR", at: "2026-09-09T08:14:00Z" },
    },
    {
      id: "DOC-GPNOTE-1",
      system: "EMIS Web (Bromley-by-Bow)",
      type: "Consultation note",
      authored_at: "2026-09-09T08:14:00Z",
      author_id: "ACT-NANDAKUMAR",
      title: "Discharge summary filed",
      body: GP_FILING_NOTE,
    },
    {
      id: "DOC-CXR-ADDENDUM",
      system: "Barts Health PACS / Radiology",
      type: "Radiology report addendum",
      authored_at: "2026-09-07T14:20:00Z",
      author_id: "ACT-REILLY",
      title: "CXR 03/09/2026 - addendum",
      body: `ADDENDUM 07/09/2026: On review, in addition to the right lower lobe
consolidation there is an 8mm well-defined nodule in the right lower lobe,
distinct from the area of consolidation and not accounted for by infection.
Recommend CT thorax for further characterisation per BTS pulmonary nodule
guidance. This addendum has been issued after the reporting clinician's shift
and has NOT been acknowledged.`,
    },
  ],

  observations: [
    {
      id: "OBS-CREAT-DISCH",
      system: "Barts Health Pathology (Winpath)",
      code: "70901-6",
      name: "Creatinine",
      value: "148",
      unit: "umol/L",
      flag: "abnormal",
      taken_at: "2026-09-08T07:15:00Z",
      released_at: "2026-09-08T10:02:00Z",
      acknowledged_by: "ACT-REILLY",
      acknowledged_at: "2026-09-08T11:40:00Z",
      note: "Baseline 92. eGFR 32. AKI stage 1.",
    },
    {
      id: "OBS-EGFR-DISCH",
      system: "Barts Health Pathology (Winpath)",
      code: "62238-1",
      name: "eGFR",
      value: "32",
      unit: "mL/min/1.73m2",
      flag: "abnormal",
      taken_at: "2026-09-08T07:15:00Z",
      released_at: "2026-09-08T10:02:00Z",
      acknowledged_by: "ACT-REILLY",
      acknowledged_at: "2026-09-08T11:40:00Z",
    },
    {
      // THE CRITICAL ONE. Released 26 hours before sim start. Nobody has it.
      id: "OBS-BC-4471",
      system: "Barts Health Microbiology (Winpath)",
      code: "600-7",
      name: "Blood culture, aerobic + anaerobic",
      value:
        "POSITIVE - Streptococcus pneumoniae. PENICILLIN RESISTANT (MIC 4 mg/L). Amoxicillin: RESISTANT. Levofloxacin: SENSITIVE. Vancomycin: SENSITIVE.",
      flag: "critical",
      taken_at: "2026-09-03T03:05:00Z",
      released_at: "2026-09-10T06:00:00Z",
      acknowledged_by: null,
      acknowledged_at: null,
      note: "Released to the requesting clinician's result inbox after the patient was discharged. Requesting clinician rotated post on 09/09.",
    },
  ],

  orders: [
    {
      id: "ORD-BC-1",
      system: "Barts Health Order Comms",
      code: "432634008",
      name: "Blood culture",
      requested_at: "2026-09-03T03:05:00Z",
      requested_by: "ACT-REILLY",
      sample_id: "BC-4471",
      status: "resulted",
      result_observation_id: "OBS-BC-4471",
    },
    {
      id: "ORD-UE-REPEAT",
      system: "Barts Health Order Comms",
      code: "1019491000000100",
      name: "Urea and electrolytes - repeat in 7 days",
      requested_at: DISCHARGE_AT,
      requested_by: "ACT-REILLY",
      status: "requested", // never collected: no appointment was ever booked
    },
  ],

  medications: [
    {
      id: "MED-AMOX",
      system: "Barts Health EPR",
      name: "Amoxicillin",
      dose: "500mg three times daily",
      route: "oral",
      started_at: "2026-09-04T08:00:00Z",
      stopped_at: "2026-09-11T22:00:00Z",
      source: "discharge",
      status: "active",
      note: "Empirical. Organism sensitivity unknown at the time of prescribing.",
    },
    {
      id: "MED-APIX",
      system: "Barts Health EPR",
      name: "Apixaban",
      dose: "5mg twice daily",
      route: "oral",
      started_at: "2026-09-05T08:00:00Z",
      source: "discharge",
      status: "active",
      note: "New anticoagulant. Dose depends on renal function and age/weight criteria.",
    },
    {
      id: "MED-BISO",
      system: "Barts Health EPR",
      name: "Bisoprolol",
      dose: "2.5mg once daily",
      route: "oral",
      started_at: "2026-09-04T08:00:00Z",
      source: "discharge",
      status: "active",
    },
    {
      id: "MED-RAMI",
      system: "Barts Health EPR",
      name: "Ramipril",
      dose: "5mg once daily",
      route: "oral",
      started_at: "2021-04-12T08:00:00Z",
      source: "pre_admission",
      status: "held",
      note: "Held on discharge due to AKI. Restart decision delegated to GP.",
    },
    {
      // The med-rec trap: still live on the GP repeat template, never stopped.
      id: "MED-NAPROXEN",
      system: "EMIS Web (Bromley-by-Bow)",
      name: "Naproxen",
      dose: "500mg twice daily as required",
      route: "oral",
      started_at: "2024-06-03T08:00:00Z",
      source: "gp_repeat",
      status: "active",
      note: "Active repeat for knee osteoarthritis. 56 tablets last issued 28/08/2026. Not referenced anywhere in the discharge summary.",
    },
    {
      id: "MED-METFORMIN",
      system: "EMIS Web (Bromley-by-Bow)",
      name: "Metformin",
      dose: "500mg twice daily",
      route: "oral",
      started_at: "2019-11-02T08:00:00Z",
      source: "gp_repeat",
      status: "active",
    },
    {
      id: "MED-ATORVA",
      system: "EMIS Web (Bromley-by-Bow)",
      name: "Atorvastatin",
      dose: "20mg at night",
      route: "oral",
      started_at: "2019-11-02T08:00:00Z",
      source: "gp_repeat",
      status: "active",
    },
  ],

  referrals: [
    {
      id: "REF-COMMUNITY-1",
      system: "Barts Health EPR -> Community referral gateway",
      to_org: "Tower Hamlets Community Health Services",
      to_lane: "community",
      reason: "Post-discharge nursing review within 48h. Lives alone, frail, new anticoagulant.",
      sent_at: "2026-09-08T16:55:00Z",
      accepted_at: null,
      accepted_by: null,
      opaque: true, // their system does not return acceptance status to us
    },
    {
      // Never created. This is the broken GP -> Pharmacy handoff.
      id: "REF-DMS-1",
      system: "Discharge Medicines Service",
      to_org: "Boots, Whitechapel Road",
      to_lane: "pharmacy",
      reason: "Discharge Medicines Service referral for medicines reconciliation.",
      sent_at: null,
      accepted_at: null,
      accepted_by: null,
    },
  ],
};
